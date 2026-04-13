import { Editor, EditorPosition, MarkdownView, Plugin } from "obsidian";
import { EditorView } from "@codemirror/view";

interface HighlightColor {
  name: string;
  class: string;
  color: string;
  bg: string;
}

const HIGHLIGHT_COLORS: HighlightColor[] = [
  { name: "Yellow",  class: "hl-yellow",  color: "#946800", bg: "#facc15" },
  { name: "Green",   class: "hl-green",   color: "#1a6b3c", bg: "#4ade80" },
  { name: "Blue",    class: "hl-blue",    color: "#1e5a8a", bg: "#60a5fa" },
  { name: "Pink",    class: "hl-pink",    color: "#9d174d", bg: "#f472b6" },
  { name: "Purple",  class: "hl-purple",  color: "#5b21b6", bg: "#a78bfa" },
  { name: "Orange",  class: "hl-orange",  color: "#9a3412", bg: "#fb923c" },
];

interface SelectionInfo {
  text: string;
  from: number;
  to: number;
}

function getCmView(editor: Editor): EditorView | null {
  return (editor as any).cm ?? null;
}

function getSelection(editor: Editor): SelectionInfo | null {
  // Try standard API first
  const text = editor.getSelection();
  if (text && text.trim().length > 0) {
    const cmView = getCmView(editor);
    if (cmView) {
      const sel = cmView.state.selection.main;
      return { text, from: sel.from, to: sel.to };
    }
    const from = editor.getCursor("from");
    const to = editor.getCursor("to");
    return { text, from: editor.posToOffset(from), to: editor.posToOffset(to) };
  }

  // Fallback: read directly from CM6 state
  const cmView = getCmView(editor);
  if (!cmView) return null;
  const sel = cmView.state.selection.main;
  if (sel.from !== sel.to) {
    const cmText = cmView.state.sliceDoc(sel.from, sel.to);
    if (cmText && cmText.trim().length > 0) {
      return { text: cmText, from: sel.from, to: sel.to };
    }
  }

  // Last resort: search the entire document for the DOM-selected text.
  // This handles callouts, embeds, and other rendered widgets where
  // posAtDOM fails or returns incorrect ranges.
  const domSel = window.getSelection();
  if (!domSel || domSel.rangeCount === 0 || domSel.isCollapsed) return null;
  const domText = domSel.toString();
  if (!domText || !domText.trim()) return null;

  const docStr = cmView.state.doc.toString();

  // Try exact match in document
  let idx = docStr.indexOf(domText);
  if (idx >= 0) {
    return { text: domText, from: idx, to: idx + domText.length };
  }

  // Handle multiline callout: DOM text has no "> " prefixes but source does
  const domLines = domText.split("\n");
  if (domLines.length > 1) {
    for (const prefix of ["> ", ">", ">  "]) {
      const withPrefixes = domLines[0] + "\n" + domLines.slice(1).map(l => prefix + l).join("\n");
      idx = docStr.indexOf(withPrefixes);
      if (idx >= 0) {
        return { text: withPrefixes, from: idx, to: idx + withPrefixes.length };
      }
    }
  }

  return null;
}

function replaceRange(editor: Editor, replacement: string, from: number, to: number) {
  const cmView = getCmView(editor);
  if (cmView) {
    cmView.dispatch({
      changes: { from, to, insert: replacement },
    });
  } else {
    // Fallback to Obsidian API
    editor.replaceSelection(replacement);
  }
}

export default class RainbowHighlightPlugin extends Plugin {
  private popover: HTMLElement | null = null;
  private currentSelection: SelectionInfo | null = null;

  onload() {
    this.registerDomEvent(document, "mouseup", (evt: MouseEvent) => {
      setTimeout(() => this.handleSelection(evt), 10);
    });

    this.registerDomEvent(document, "keyup", (evt: KeyboardEvent) => {
      if (evt.shiftKey) {
        setTimeout(() => this.handleSelection(evt), 10);
      }
    });

    this.registerDomEvent(document, "mousedown", (evt: MouseEvent) => {
      if (this.popover && !this.popover.contains(evt.target as Node)) {
        this.removePopover();
      }
    });

    this.registerDomEvent(document, "scroll", () => {
      this.removePopover();
    }, true);

    HIGHLIGHT_COLORS.forEach((color) => {
      this.addCommand({
        id: `highlight-${color.class}`,
        name: `Highlight: ${color.name.toLowerCase()}`,
        editorCallback: (editor: Editor) => {
          this.applyHighlight(editor, color);
        },
      });
    });

    this.addCommand({
      id: "remove-highlight",
      name: "Remove highlight",
      editorCallback: (editor: Editor) => {
        this.removeHighlight(editor);
      },
    });
  }

  onunload() {
    this.removePopover();
  }

  private handleSelection(evt: MouseEvent | KeyboardEvent) {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!activeView) return;

    const editor = activeView.editor;
    const selInfo = getSelection(editor);

    if (!selInfo) {
      this.removePopover();
      return;
    }

    this.currentSelection = selInfo;

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    this.showPopover(rect, editor);
  }

  private showPopover(rect: DOMRect, editor: Editor) {
    this.removePopover();

    const popover = document.createElement("div");
    popover.addClass("hl-popover");

    const colorsContainer = document.createElement("div");
    colorsContainer.addClass("hl-popover-colors");

    HIGHLIGHT_COLORS.forEach((color) => {
      const circle = document.createElement("button");
      circle.addClass("hl-color-circle");
      circle.setAttribute("aria-label", color.name);
      circle.style.setProperty("--circle-bg", color.bg);
      circle.style.setProperty("--circle-border", color.color);

      circle.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.applyHighlight(editor, color);
        this.removePopover();
      });

      colorsContainer.appendChild(circle);
    });

    const removeBtn = document.createElement("button");
    removeBtn.addClass("hl-color-circle", "hl-remove-circle");
    removeBtn.setAttribute("aria-label", "Remove highlight");
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("width", "10");
    svg.setAttribute("height", "10");
    const line1 = document.createElementNS(svgNS, "line");
    line1.setAttribute("x1", "3"); line1.setAttribute("y1", "3");
    line1.setAttribute("x2", "13"); line1.setAttribute("y2", "13");
    line1.setAttribute("stroke", "currentColor"); line1.setAttribute("stroke-width", "2");
    line1.setAttribute("stroke-linecap", "round");
    const line2 = document.createElementNS(svgNS, "line");
    line2.setAttribute("x1", "13"); line2.setAttribute("y1", "3");
    line2.setAttribute("x2", "3"); line2.setAttribute("y2", "13");
    line2.setAttribute("stroke", "currentColor"); line2.setAttribute("stroke-width", "2");
    line2.setAttribute("stroke-linecap", "round");
    svg.appendChild(line1);
    svg.appendChild(line2);
    removeBtn.appendChild(svg);
    removeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.removeHighlight(editor);
      this.removePopover();
    });
    colorsContainer.appendChild(removeBtn);

    popover.appendChild(colorsContainer);
    document.body.appendChild(popover);

    const popoverRect = popover.getBoundingClientRect();
    let top = rect.top - popoverRect.height - 8;
    let left = rect.left + rect.width / 2 - popoverRect.width / 2;

    if (top < 0) {
      top = rect.bottom + 8;
    }

    if (left < 8) left = 8;
    if (left + popoverRect.width > window.innerWidth - 8) {
      left = window.innerWidth - popoverRect.width - 8;
    }

    popover.style.top = `${top}px`;
    popover.style.left = `${left}px`;

    this.popover = popover;
  }

  private removePopover() {
    if (this.popover) {
      this.popover.remove();
      this.popover = null;
    }
  }

  private mdToHtml(text: string): string {
    let result = text;
    result = result.replace(/\*\*\*([\s\S]*?)\*\*\*/g, "<b><i>$1</i></b>");
    result = result.replace(/\*\*([\s\S]*?)\*\*/g, "<b>$1</b>");
    result = result.replace(/\*([\s\S]*?)\*/g, "<i>$1</i>");
    result = result.replace(/~~([\s\S]*?)~~/g, "<s>$1</s>");
    result = result.replace(/==([\s\S]*?)==/g, "$1");
    return result;
  }

  private wrapWithMark(text: string, colorClass: string): string {
    const inner = this.mdToHtml(text);
    return `<mark class="${colorClass}">${inner}</mark>`;
  }

  private applyHighlight(editor: Editor, color: HighlightColor) {
    const selInfo = this.currentSelection ?? getSelection(editor);
    if (!selInfo) return;

    const cleanText = selInfo.text.replace(
      /<mark class="hl-\w+">([\s\S]*?)<\/mark>/g,
      "$1"
    );

    const highlighted = this.wrapWithMark(cleanText, color.class);
    replaceRange(editor, highlighted, selInfo.from, selInfo.to);
    this.currentSelection = null;
  }

  private removeHighlight(editor: Editor) {
    const selInfo = this.currentSelection ?? getSelection(editor);
    if (!selInfo) return;

    const cleaned = selInfo.text.replace(
      /<mark class="hl-\w+">([\s\S]*?)<\/mark>/g,
      "$1"
    );
    replaceRange(editor, cleaned, selInfo.from, selInfo.to);
    this.currentSelection = null;
  }
}
