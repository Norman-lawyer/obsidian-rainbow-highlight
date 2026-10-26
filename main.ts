import { Editor, MarkdownView, Notice, Plugin, setIcon } from "obsidian";
import {
  applyColorToText,
  expandToPluginMark,
  findClosestSelection,
  findPluginMarkAtOffset,
  HighlightKind,
  removeHighlightsFromText,
  SelectionInfo,
} from "./highlight-utils";
import {
  hasUsableSelectionRect,
  replaceExactSourceRange,
  shouldQueueSelectionAfterPointerUp,
} from "./selection-ui";

interface HighlightColor {
  name: string;
  class: string;
  color: string;
  bg: string;
}

interface CmEditorView {
  state: {
    selection: { main: { from: number; to: number } };
    doc: { toString(): string };
    sliceDoc(from: number, to: number): string;
  };
  dispatch(tr: { changes: { from: number; to: number; insert: string } }): void;
  posAtDOM?(node: Node, offset?: number): number;
}

interface EditorWithCm extends Editor {
  cm?: CmEditorView;
}

const HIGHLIGHT_COLORS: HighlightColor[] = [
  { name: "Red", class: "hl-red", color: "#991b1b", bg: "#ef4444" },
  { name: "Orange", class: "hl-orange", color: "#9a3412", bg: "#fb923c" },
  { name: "Yellow", class: "hl-yellow", color: "#946800", bg: "#facc15" },
  { name: "Green", class: "hl-green", color: "#166534", bg: "#4ade80" },
  { name: "Cyan", class: "hl-cyan", color: "#155e75", bg: "#22d3ee" },
  { name: "Blue", class: "hl-blue", color: "#1e40af", bg: "#60a5fa" },
  { name: "Purple", class: "hl-purple", color: "#5b21b6", bg: "#a78bfa" },
];

function getCmView(editor: Editor): CmEditorView | null {
  return (editor as EditorWithCm).cm ?? null;
}

function getDomSelection(
  editor: Editor,
  sourceText?: string
): SelectionInfo | null {
  const cmView = getCmView(editor);
  if (!cmView) return null;
  const domSelection = window.getSelection();
  if (!domSelection || domSelection.rangeCount === 0 || domSelection.isCollapsed) {
    return null;
  }
  const domText = domSelection.toString();
  if (!domText || !domText.trim()) return null;

  const editorSelection = cmView.state.selection.main;
  let hintFrom = editorSelection.from;
  let hintTo = editorSelection.to;
  const range = domSelection.getRangeAt(0);
  if (cmView.posAtDOM) {
    try {
      hintFrom = cmView.posAtDOM(range.startContainer, range.startOffset);
      hintTo = cmView.posAtDOM(range.endContainer, range.endOffset);
    } catch {
      // Reading-view nodes and some rendered widgets are outside CodeMirror.
    }
  }

  return findClosestSelection(
    sourceText ?? cmView.state.doc.toString(),
    domText,
    hintFrom,
    hintTo
  );
}

function getSelection(
  editor: Editor,
  preferDomSelection = false,
  sourceText?: string
): SelectionInfo | null {
  if (preferDomSelection) {
    const domSelection = getDomSelection(editor, sourceText);
    if (domSelection) return domSelection;
  }

  const text = editor.getSelection();
  if (text && text.trim().length > 0) {
    const cmView = getCmView(editor);
    if (cmView) {
      const selection = cmView.state.selection.main;
      return { text, from: selection.from, to: selection.to };
    }
    const from = editor.getCursor("from");
    const to = editor.getCursor("to");
    return { text, from: editor.posToOffset(from), to: editor.posToOffset(to) };
  }

  const cmView = getCmView(editor);
  if (!cmView) return null;
  const selection = cmView.state.selection.main;
  if (selection.from !== selection.to) {
    const cmText = cmView.state.sliceDoc(selection.from, selection.to);
    if (cmText && cmText.trim().length > 0) {
      return { text: cmText, from: selection.from, to: selection.to };
    }
  }

  // Rendered widgets such as callouts expose a DOM selection but not always a
  // CodeMirror selection. Use the nearest source occurrence, not the first one.
  return getDomSelection(editor);
}

export default class RainbowHighlightPlugin extends Plugin {
  private popover: HTMLElement | null = null;
  private currentSelection: SelectionInfo | null = null;
  private selectionTimer: number | null = null;
  private ignoreSelectionUntil = 0;
  private pointerIsDown = false;

  onload() {
    this.registerDomEvent(document, "pointerdown", () => {
      this.pointerIsDown = true;
    });

    this.registerDomEvent(document, "pointerup", (event: PointerEvent) => {
      this.pointerIsDown = false;
      if (
        shouldQueueSelectionAfterPointerUp(
          this.popover,
          event.target as Node | null
        )
      ) {
        this.queueSelection(30);
      }
    });

    this.registerDomEvent(document, "pointercancel", () => {
      this.pointerIsDown = false;
    });

    this.registerDomEvent(document, "selectionchange", () => {
      if (!this.pointerIsDown) this.queueSelection(80);
    });

    this.registerDomEvent(document, "keyup", (event: KeyboardEvent) => {
      if (event.shiftKey) this.queueSelection(10);
    });

    this.registerDomEvent(document, "mousedown", (event: MouseEvent) => {
      if (this.popover && !this.popover.contains(event.target as Node)) {
        this.removePopover(true);
      }
    });

    this.registerDomEvent(document, "scroll", () => this.removePopover(true), true);
    this.registerDomEvent(window, "resize", () => this.removePopover(true));

    HIGHLIGHT_COLORS.forEach((color) => {
      this.addCommand({
        id: `highlight-${color.class}`,
        name: `Highlight background: ${color.name.toLowerCase()}`,
        editorCallback: (editor: Editor) => this.applyColor(editor, color, "bg"),
      });
      this.addCommand({
        id: `text-${color.class}`,
        name: `Text color: ${color.name.toLowerCase()}`,
        editorCallback: (editor: Editor) => this.applyColor(editor, color, "text"),
      });
    });

    this.addCommand({
      id: "remove-highlight",
      name: "Remove highlight",
      editorCallback: (editor: Editor) => this.removeHighlight(editor),
    });
  }

  onunload() {
    if (this.selectionTimer !== null) window.clearTimeout(this.selectionTimer);
    this.removePopover(true);
  }

  private queueSelection(delay: number) {
    if (this.selectionTimer !== null) window.clearTimeout(this.selectionTimer);
    this.selectionTimer = window.setTimeout(() => {
      this.selectionTimer = null;
      this.handleSelection();
    }, delay);
  }

  private handleSelection() {
    if (Date.now() < this.ignoreSelectionUntil) return;
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!activeView) {
      this.removePopover(true);
      return;
    }

    const domSelection = window.getSelection();
    const anchor = domSelection?.anchorNode;
    if (!anchor || !activeView.containerEl.contains(anchor)) {
      this.removePopover(true);
      return;
    }

    const editor = activeView.editor;
    const isPreview = activeView.getMode() === "preview";
    const selectionInfo = getSelection(
      editor,
      isPreview,
      isPreview ? activeView.getViewData() : undefined
    );
    if (!selectionInfo || !domSelection || domSelection.rangeCount === 0) {
      this.removePopover(true);
      return;
    }

    this.currentSelection = selectionInfo;
    const rect = domSelection.getRangeAt(0).getBoundingClientRect();
    if (!hasUsableSelectionRect(rect)) {
      this.removePopover(true);
      return;
    }
    this.showPopover(rect, editor);
  }

  private showPopover(rect: DOMRect, editor: Editor) {
    this.removePopover(false);

    const popover = document.createElement("div");
    popover.addClass("hl-popover");
    popover.addEventListener("mousedown", (event) => {
      // Keep the note selection alive until the palette action uses it.
      event.preventDefault();
      event.stopPropagation();
    });
    const container = document.createElement("div");
    container.addClass("hl-popover-colors");

    const backgroundRow = this.buildRow(editor, "bg", "Background");
    backgroundRow.appendChild(this.buildRemoveButton(editor));
    container.appendChild(backgroundRow);
    container.appendChild(this.buildRow(editor, "text", "Text"));
    popover.appendChild(container);
    document.body.appendChild(popover);

    const popoverRect = popover.getBoundingClientRect();
    let top = rect.top - popoverRect.height - 8;
    let left = rect.left + rect.width / 2 - popoverRect.width / 2;
    if (top < 8) top = rect.bottom + 8;
    left = Math.max(8, Math.min(left, window.innerWidth - popoverRect.width - 8));

    popover.style.top = `${top}px`;
    popover.style.left = `${left}px`;
    this.popover = popover;
  }

  private buildRow(
    editor: Editor,
    kind: HighlightKind,
    labelText: string
  ): HTMLElement {
    const row = document.createElement("div");
    row.addClass("hl-popover-row");
    const label = document.createElement("div");
    label.addClass("hl-row-icon");
    label.setAttribute("aria-label", labelText);
    label.setAttribute("title", labelText);
    setIcon(label, kind === "bg" ? "highlighter" : "type");
    row.appendChild(label);

    HIGHLIGHT_COLORS.forEach((color) => {
      const circle = document.createElement("button");
      circle.addClass("hl-color-circle");
      const tooltip = `${labelText}: ${color.name.toLowerCase()}`;
      circle.setAttribute("aria-label", tooltip);
      circle.setAttribute("title", tooltip);
      if (kind === "bg") {
        circle.style.setProperty("--circle-bg", color.bg);
        circle.style.setProperty("--circle-border", color.color);
      } else {
        circle.addClass("hl-text-circle");
        circle.style.setProperty("--circle-text", color.bg);
        circle.setText("A");
      }

      circle.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.suppressSelectionHandling();
        void this.applyColor(editor, color, kind).finally(() => {
          this.removePopover(true);
        });
      });
      row.appendChild(circle);
    });

    return row;
  }

  private buildRemoveButton(editor: Editor): HTMLButtonElement {
    const button = document.createElement("button");
    button.addClass("hl-color-circle", "hl-remove-circle");
    button.setAttribute("aria-label", "Remove highlight");
    button.setAttribute("title", "Remove highlight");
    setIcon(button, "x");
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.suppressSelectionHandling();
      void this.removeHighlight(editor).finally(() => {
        this.removePopover(true);
      });
    });
    return button;
  }

  private removePopover(clearSelection: boolean) {
    this.popover?.remove();
    this.popover = null;
    if (clearSelection) {
      this.currentSelection = null;
      if (this.selectionTimer !== null) {
        window.clearTimeout(this.selectionTimer);
        this.selectionTimer = null;
      }
    }
  }

  private suppressSelectionHandling() {
    this.ignoreSelectionUntil = Date.now() + 350;
    if (this.selectionTimer !== null) {
      window.clearTimeout(this.selectionTimer);
      this.selectionTimer = null;
    }
  }

  private clearDomSelection() {
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed) selection.removeAllRanges();
  }

  private getSourceText(editor: Editor): string | null {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (activeView?.getMode() === "preview") return activeView.getViewData();
    return getCmView(editor)?.state.doc.toString() ?? null;
  }

  private async replaceRange(
    editor: Editor,
    replacement: string,
    selectionInfo: SelectionInfo
  ): Promise<boolean> {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (activeView?.getMode() === "preview" && activeView.file) {
      try {
        await this.app.vault.process(activeView.file, (source) => {
          const updated = replaceExactSourceRange(
            source,
            selectionInfo,
            replacement
          );
          if (updated === null) throw new Error("The note changed after selection");
          return updated;
        });
        return true;
      } catch {
        new Notice("Rainbow Highlight: selection changed; please select the text again.");
        return false;
      }
    }

    const cmView = getCmView(editor);
    if (cmView) {
      cmView.dispatch({
        changes: {
          from: selectionInfo.from,
          to: selectionInfo.to,
          insert: replacement,
        },
      });
    } else {
      editor.replaceRange(
        replacement,
        editor.offsetToPos(selectionInfo.from),
        editor.offsetToPos(selectionInfo.to)
      );
    }
    return true;
  }

  private async applyColor(
    editor: Editor,
    color: HighlightColor,
    kind: HighlightKind
  ) {
    let selectionInfo = this.currentSelection ?? getSelection(editor);
    if (!selectionInfo) return;

    const sourceText = this.getSourceText(editor);
    if (sourceText) {
      selectionInfo = expandToPluginMark(sourceText, selectionInfo);
    }
    const newClass = kind === "bg"
      ? color.class
      : color.class.replace(/^hl-/, "hlt-");
    const highlighted = applyColorToText(selectionInfo.text, newClass, kind);
    if (await this.replaceRange(editor, highlighted, selectionInfo)) {
      this.clearDomSelection();
    }
    this.currentSelection = null;
  }

  private async removeHighlight(editor: Editor) {
    let selectionInfo = this.currentSelection ?? getSelection(editor);
    const cmView = getCmView(editor);
    if (!selectionInfo && cmView) {
      selectionInfo = findPluginMarkAtOffset(
        cmView.state.doc.toString(),
        cmView.state.selection.main.from
      );
    }
    if (!selectionInfo) return;

    const sourceText = this.getSourceText(editor);
    if (sourceText) {
      selectionInfo = expandToPluginMark(sourceText, selectionInfo);
    }
    const cleaned = removeHighlightsFromText(selectionInfo.text);
    if (await this.replaceRange(editor, cleaned, selectionInfo)) {
      this.clearDomSelection();
    }
    this.currentSelection = null;
  }
}
