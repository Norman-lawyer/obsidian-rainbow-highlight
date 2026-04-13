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
  default: () => RainbowHighlightPlugin
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
function getCmView(editor) {
  var _a;
  return (_a = editor.cm) != null ? _a : null;
}
function getSelection(editor) {
  const text = editor.getSelection();
  if (text && text.trim().length > 0) {
    const cmView2 = getCmView(editor);
    if (cmView2) {
      const sel2 = cmView2.state.selection.main;
      return { text, from: sel2.from, to: sel2.to };
    }
    const from = editor.getCursor("from");
    const to = editor.getCursor("to");
    return { text, from: editor.posToOffset(from), to: editor.posToOffset(to) };
  }
  const cmView = getCmView(editor);
  if (!cmView)
    return null;
  const sel = cmView.state.selection.main;
  if (sel.from !== sel.to) {
    const cmText = cmView.state.sliceDoc(sel.from, sel.to);
    if (cmText && cmText.trim().length > 0) {
      return { text: cmText, from: sel.from, to: sel.to };
    }
  }
  const domSel = window.getSelection();
  if (!domSel || domSel.rangeCount === 0 || domSel.isCollapsed)
    return null;
  const range = domSel.getRangeAt(0);
  try {
    const from = cmView.posAtDOM(range.startContainer, range.startOffset);
    const to = cmView.posAtDOM(range.endContainer, range.endOffset);
    if (from === to)
      return null;
    const docFrom = Math.min(from, to);
    const docTo = Math.max(from, to);
    const docText = cmView.state.sliceDoc(docFrom, docTo);
    if (!docText || docText.trim().length === 0)
      return null;
    return { text: docText, from: docFrom, to: docTo };
  } catch (e) {
    return null;
  }
}
function replaceRange(editor, replacement, from, to) {
  const cmView = getCmView(editor);
  if (cmView) {
    cmView.dispatch({
      changes: { from, to, insert: replacement }
    });
  } else {
    editor.replaceSelection(replacement);
  }
}
var RainbowHighlightPlugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.popover = null;
    this.currentSelection = null;
  }
  onload() {
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
        name: `Highlight: ${color.name.toLowerCase()}`,
        editorCallback: (editor) => {
          this.applyHighlight(editor, color);
        }
      });
    });
    this.addCommand({
      id: "remove-highlight",
      name: "Remove highlight",
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
    const selInfo = getSelection(editor);
    if (!selInfo) {
      this.removePopover();
      return;
    }
    this.currentSelection = selInfo;
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
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("width", "10");
    svg.setAttribute("height", "10");
    const line1 = document.createElementNS(svgNS, "line");
    line1.setAttribute("x1", "3");
    line1.setAttribute("y1", "3");
    line1.setAttribute("x2", "13");
    line1.setAttribute("y2", "13");
    line1.setAttribute("stroke", "currentColor");
    line1.setAttribute("stroke-width", "2");
    line1.setAttribute("stroke-linecap", "round");
    const line2 = document.createElementNS(svgNS, "line");
    line2.setAttribute("x1", "13");
    line2.setAttribute("y1", "3");
    line2.setAttribute("x2", "3");
    line2.setAttribute("y2", "13");
    line2.setAttribute("stroke", "currentColor");
    line2.setAttribute("stroke-width", "2");
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
    var _a;
    const selInfo = (_a = this.currentSelection) != null ? _a : getSelection(editor);
    if (!selInfo)
      return;
    const cleanText = selInfo.text.replace(
      /<mark class="hl-\w+">([\s\S]*?)<\/mark>/g,
      "$1"
    );
    const highlighted = this.wrapWithMark(cleanText, color.class);
    replaceRange(editor, highlighted, selInfo.from, selInfo.to);
    this.currentSelection = null;
  }
  removeHighlight(editor) {
    var _a;
    const selInfo = (_a = this.currentSelection) != null ? _a : getSelection(editor);
    if (!selInfo)
      return;
    const cleaned = selInfo.text.replace(
      /<mark class="hl-\w+">([\s\S]*?)<\/mark>/g,
      "$1"
    );
    replaceRange(editor, cleaned, selInfo.from, selInfo.to);
    this.currentSelection = null;
  }
};
