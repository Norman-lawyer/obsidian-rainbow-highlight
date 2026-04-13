var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => AppleHighlightPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var HIGHLIGHT_COLORS = [
  { name: "Yellow", class: "hl-yellow", color: "#946800", bg: "#facc15" },
  { name: "Green", class: "hl-green", color: "#1a6b3c", bg: "#4ade80" },
  { name: "Blue", class: "hl-blue", color: "#1e5a8a", bg: "#60a5fa" },
  { name: "Pink", class: "hl-pink", color: "#9d174d", bg: "#f472b6" },
  { name: "Purple", class: "hl-purple", color: "#5b21b6", bg: "#a78bfa" },
  { name: "Orange", class: "hl-orange", color: "#9a3412", bg: "#fb923c" }
];
var AppleHighlightPlugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.popover = null;
    this.selectionHandler = null;
  }
  async onload() {
    this.registerDomEvent(document, "mouseup", (evt) => {
      setTimeout(() => this.handleSelection(evt), 10);
    });
    this.registerDomEvent(document, "keyup", (evt) => {
      if (evt.shiftKey) {
        setTimeout(() => this.handleSelection(evt), 10);
      }
    });
    this.registerDomEvent(document, "mousedown", (evt) => {
      if (this.popover && !this.popover.contains(evt.target)) {
        this.removePopover();
      }
    });
    this.registerDomEvent(document, "scroll", () => {
      this.removePopover();
    }, true);
    HIGHLIGHT_COLORS.forEach((color) => {
      this.addCommand({
        id: `highlight-${color.class}`,
        name: `Highlight: ${color.name}`,
        editorCallback: (editor) => {
          this.applyHighlight(editor, color);
        }
      });
    });
    this.addCommand({
      id: "remove-highlight",
      name: "Remove Highlight",
      editorCallback: (editor) => {
        this.removeHighlight(editor);
      }
    });
  }
  onunload() {
    this.removePopover();
  }
  handleSelection(evt) {
    const activeView = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
    if (!activeView)
      return;
    const editor = activeView.editor;
    const selectedText = editor.getSelection();
    if (!selectedText || selectedText.trim().length === 0) {
      this.removePopover();
      return;
    }
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0)
      return;
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    this.showPopover(rect, editor);
  }
  showPopover(rect, editor) {
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
    const popoverRect = popover.getBoundingClientRect();
    let top = rect.top - popoverRect.height - 8;
    let left = rect.left + rect.width / 2 - popoverRect.width / 2;
    if (top < 0) {
      top = rect.bottom + 8;
    }
    if (left < 8)
      left = 8;
    if (left + popoverRect.width > window.innerWidth - 8) {
      left = window.innerWidth - popoverRect.width - 8;
    }
    popover.style.top = `${top}px`;
    popover.style.left = `${left}px`;
    this.popover = popover;
  }
  removePopover() {
    if (this.popover) {
      this.popover.remove();
      this.popover = null;
    }
  }
  mdToHtml(text) {
    let result = text;
    result = result.replace(/\*\*\*([\s\S]*?)\*\*\*/g, "<b><i>$1</i></b>");
    result = result.replace(/\*\*([\s\S]*?)\*\*/g, "<b>$1</b>");
    result = result.replace(/\*([\s\S]*?)\*/g, "<i>$1</i>");
    result = result.replace(/~~([\s\S]*?)~~/g, "<s>$1</s>");
    result = result.replace(/==([\s\S]*?)==/g, "$1");
    return result;
  }
  wrapWithMark(text, colorClass) {
    const inner = this.mdToHtml(text);
    return `<mark class="${colorClass}">${inner}</mark>`;
  }
  applyHighlight(editor, color) {
    const selectedText = editor.getSelection();
    if (!selectedText)
      return;
    const cleanText = selectedText.replace(
      /<mark class="hl-\w+">([\s\S]*?)<\/mark>/g,
      "$1"
    );
    const highlighted = this.wrapWithMark(cleanText, color.class);
    editor.replaceSelection(highlighted);
  }
  removeHighlight(editor) {
    const selectedText = editor.getSelection();
    if (!selectedText)
      return;
    const cleaned = selectedText.replace(
      /<mark class="hl-\w+">([\s\S]*?)<\/mark>/g,
      "$1"
    );
    editor.replaceSelection(cleaned);
  }
};
