import { Editor, MarkdownView, Plugin } from "obsidian";

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

export default class AppleHighlightPlugin extends Plugin {
  private popover: HTMLElement | null = null;
  private selectionHandler: (() => void) | null = null;

  async onload() {
    // Register the mouseup handler on the workspace
    this.registerDomEvent(document, "mouseup", (evt: MouseEvent) => {
      // Small delay to let the selection finalize
      setTimeout(() => this.handleSelection(evt), 10);
    });

    // Register keyboard selection (shift+arrow keys)
    this.registerDomEvent(document, "keyup", (evt: KeyboardEvent) => {
      if (evt.shiftKey) {
        setTimeout(() => this.handleSelection(evt), 10);
      }
    });

    // Close popover on click outside
    this.registerDomEvent(document, "mousedown", (evt: MouseEvent) => {
      if (this.popover && !this.popover.contains(evt.target as Node)) {
        this.removePopover();
      }
    });

    // Close popover on scroll
    this.registerDomEvent(document, "scroll", () => {
      this.removePopover();
    }, true);

    // Add command for each color
    HIGHLIGHT_COLORS.forEach((color) => {
      this.addCommand({
        id: `highlight-${color.class}`,
        name: `Highlight: ${color.name}`,
        editorCallback: (editor: Editor) => {
          this.applyHighlight(editor, color);
        },
      });
    });

    // Add remove highlight command
    this.addCommand({
      id: "remove-highlight",
      name: "Remove Highlight",
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
    const selectedText = editor.getSelection();

    if (!selectedText || selectedText.trim().length === 0) {
      this.removePopover();
      return;
    }

    // Get cursor position for popover placement
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

    // Color circles
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

    // Remove highlight button
    const removeBtn = document.createElement("button");
    removeBtn.addClass("hl-color-circle", "hl-remove-circle");
    removeBtn.setAttribute("aria-label", "Remove highlight");
    removeBtn.innerHTML = `<svg viewBox="0 0 16 16" width="10" height="10"><line x1="3" y1="3" x2="13" y2="13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="13" y1="3" x2="3" y2="13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
    removeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.removeHighlight(editor);
      this.removePopover();
    });
    colorsContainer.appendChild(removeBtn);

    popover.appendChild(colorsContainer);
    document.body.appendChild(popover);

    // Position the popover above the selection
    const popoverRect = popover.getBoundingClientRect();
    let top = rect.top - popoverRect.height - 8;
    let left = rect.left + rect.width / 2 - popoverRect.width / 2;

    // If not enough space above, show below
    if (top < 0) {
      top = rect.bottom + 8;
    }

    // Keep within viewport horizontally
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
    // Convert markdown formatting to HTML equivalents
    // Order matters: bold-italic first, then bold, then italic
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
    const selectedText = editor.getSelection();
    if (!selectedText) return;

    // Strip existing highlight mark tags if re-highlighting
    const cleanText = selectedText.replace(
      /<mark class="hl-\w+">([\s\S]*?)<\/mark>/g,
      "$1"
    );

    const highlighted = this.wrapWithMark(cleanText, color.class);
    editor.replaceSelection(highlighted);
  }

  private removeHighlight(editor: Editor) {
    const selectedText = editor.getSelection();
    if (!selectedText) return;

    const cleaned = selectedText.replace(
      /<mark class="hl-\w+">([\s\S]*?)<\/mark>/g,
      "$1"
    );
    editor.replaceSelection(cleaned);
  }
}
