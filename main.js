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

// highlight-utils.ts
var PLUGIN_CLASS = /^(?:hl|hlt)-[\w-]+$/;
function calloutCandidates(text) {
  const normalized = text.replace(/\r\n?/g, "\n");
  const candidates = [normalized];
  const lines = normalized.split("\n");
  if (lines.length > 1) {
    for (const prefix of ["> ", ">", ">  "]) {
      candidates.push(
        lines[0] + "\n" + lines.slice(1).map((line) => prefix + line).join("\n")
      );
    }
  }
  return [...new Set(candidates)];
}
function findOccurrences(text, candidate) {
  const occurrences = [];
  let index = text.indexOf(candidate);
  while (index >= 0) {
    occurrences.push(index);
    index = text.indexOf(candidate, index + 1);
  }
  return occurrences;
}
function findClosestSelection(documentText, selectedText, hintFrom, hintTo = hintFrom) {
  let best = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  const rangeStart = Math.min(hintFrom, hintTo);
  const rangeEnd = Math.max(hintFrom, hintTo);
  const consider = (from, to) => {
    const distance = to < rangeStart ? rangeStart - to : from > rangeEnd ? from - rangeEnd : 0;
    if (distance < bestDistance) {
      best = { text: documentText.slice(from, to), from, to };
      bestDistance = distance;
    }
  };
  const candidates = calloutCandidates(selectedText);
  for (const candidate of candidates) {
    for (const index of findOccurrences(documentText, candidate)) {
      consider(index, index + candidate.length);
    }
  }
  const searchView = buildSearchView(documentText);
  for (const candidate of candidates) {
    for (const index of findOccurrences(searchView.text, candidate)) {
      const lastIndex = index + candidate.length - 1;
      if (lastIndex >= index) {
        const from = searchView.starts[index];
        const to = searchView.ends[lastIndex];
        consider(from, to);
      }
    }
  }
  return best;
}
function hasPluginClass(classNames) {
  return classNames.split(/\s+/).some((name) => PLUGIN_CLASS.test(name));
}
function parsePluginMarks(documentText) {
  var _a;
  const tagPattern = /<mark(?:\s+class="([^"]*)")?\s*>|<\/mark>/g;
  const stack = [];
  const marks = [];
  let match;
  while ((match = tagPattern.exec(documentText)) !== null) {
    if (!match[0].startsWith("</")) {
      const classNames = (_a = match[1]) != null ? _a : "";
      stack.push({
        from: match.index,
        innerFrom: tagPattern.lastIndex,
        classNames,
        plugin: hasPluginClass(classNames)
      });
      continue;
    }
    const opening = stack.pop();
    if (!(opening == null ? void 0 : opening.plugin))
      continue;
    marks.push({
      text: documentText.slice(opening.from, tagPattern.lastIndex),
      from: opening.from,
      to: tagPattern.lastIndex,
      classNames: opening.classNames,
      innerFrom: opening.innerFrom,
      innerTo: match.index
    });
  }
  return marks.sort((a, b) => a.from - b.from || b.to - a.to);
}
function pluginTagRanges(documentText) {
  return parsePluginMarks(documentText).flatMap((mark) => [
    { from: mark.from, to: mark.innerFrom, kind: "open" },
    { from: mark.innerTo, to: mark.to, kind: "close" }
  ]).sort((a, b) => a.from - b.from || a.to - b.to);
}
function buildSearchView(documentText) {
  const hiddenRanges = pluginTagRanges(documentText);
  let text = "";
  const starts = [];
  const ends = [];
  let sourceIndex = 0;
  let rangeIndex = 0;
  let pendingStart = null;
  while (sourceIndex < documentText.length) {
    const hidden = hiddenRanges[rangeIndex];
    if (hidden && sourceIndex === hidden.from) {
      if (hidden.kind === "open" && pendingStart === null) {
        pendingStart = hidden.from;
      } else if (hidden.kind === "close" && ends.length > 0) {
        ends[ends.length - 1] = hidden.to;
      }
      sourceIndex = hidden.to;
      rangeIndex += 1;
      continue;
    }
    text += documentText[sourceIndex];
    starts.push(pendingStart != null ? pendingStart : sourceIndex);
    ends.push(sourceIndex + 1);
    pendingStart = null;
    sourceIndex += 1;
  }
  return { text, starts, ends };
}
function findPluginMarkAtOffset(documentText, offset) {
  const candidates = parsePluginMarks(documentText).filter((mark2) => offset >= mark2.innerFrom && offset <= mark2.innerTo).sort((a, b) => a.to - a.from - (b.to - b.from));
  const mark = candidates[0];
  return mark ? { text: mark.text, from: mark.from, to: mark.to } : null;
}
function expandToPluginMark(documentText, selection) {
  const candidates = parsePluginMarks(documentText).filter((mark2) => selection.from >= mark2.innerFrom && selection.to <= mark2.innerTo).sort((a, b) => a.to - a.from - (b.to - b.from));
  const mark = candidates[0];
  return mark ? { text: mark.text, from: mark.from, to: mark.to } : selection;
}
function wrapInline(text, colorClass) {
  const wrappers = ["***", "___", "**", "__", "~~", "*", "_"];
  for (const wrapper of wrappers) {
    if (text.length > wrapper.length * 2 && text.startsWith(wrapper) && text.endsWith(wrapper)) {
      const inner = text.slice(wrapper.length, -wrapper.length);
      return `${wrapper}<mark class="${colorClass}">${inner}</mark>${wrapper}`;
    }
  }
  if (text.length > 4 && text.startsWith("==") && text.endsWith("==")) {
    text = text.slice(2, -2);
  }
  return `<mark class="${colorClass}">${text}</mark>`;
}
function wrapWithMark(text, colorClass) {
  let fence = null;
  return text.split("\n").map((line) => {
    var _a, _b, _c, _d;
    if (!line)
      return line;
    const quote = (_b = (_a = line.match(/^((?: {0,3}>[ \t]*)+)/)) == null ? void 0 : _a[1]) != null ? _b : "";
    let content = line.slice(quote.length);
    const fenceMatch = content.match(/^ {0,3}(`{3,}|~{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      if (!fence) {
        fence = { character: marker[0], length: marker.length };
      } else if (marker[0] === fence.character && marker.length >= fence.length) {
        fence = null;
      }
      return line;
    }
    if (fence)
      return line;
    let prefix = quote;
    const callout = content.match(/^(\[![^\]]+\][+-]?[ \t]*)/);
    if (callout) {
      prefix += callout[1];
      content = content.slice(callout[1].length);
    }
    const heading = content.match(/^( {0,3}#{1,6}[ \t]+)/);
    const list = content.match(
      /^([ \t]{0,3}(?:(?:[-+*])|(?:\d{1,9}[.)]))[ \t]+(?:\[[ xX]\][ \t]+)?)/
    );
    const blockPrefix = (_d = (_c = heading == null ? void 0 : heading[1]) != null ? _c : list == null ? void 0 : list[1]) != null ? _d : "";
    prefix += blockPrefix;
    content = content.slice(blockPrefix.length);
    if (/^\|.*\|[ \t]*$/.test(content) || /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/.test(content)) {
      return line;
    }
    if (!content)
      return line;
    return `${prefix}${wrapInline(content, colorClass)}`;
  }).join("\n");
}
function applyColorToText(text, newClass, kind) {
  const whole = text.match(/^<mark\s+class="([^"]*)">([\s\S]*)<\/mark>$/);
  if (whole && hasPluginClass(whole[1])) {
    const classes = whole[1].split(/\s+/).filter(Boolean).filter((className) => {
      if (kind === "bg")
        return !className.startsWith("hl-");
      return !className.startsWith("hlt-");
    });
    classes.push(newClass);
    return `<mark class="${classes.join(" ")}">${removeHighlightsFromText(whole[2])}</mark>`;
  }
  return wrapWithMark(removeHighlightsFromText(text), newClass);
}
function removeHighlightsFromText(text) {
  const hiddenRanges = pluginTagRanges(text);
  if (hiddenRanges.length === 0)
    return text;
  let result = "";
  let cursor = 0;
  for (const hidden of hiddenRanges) {
    if (hidden.from < cursor)
      continue;
    result += text.slice(cursor, hidden.from);
    cursor = hidden.to;
  }
  return result + text.slice(cursor);
}

// main.ts
var HIGHLIGHT_COLORS = [
  { name: "Red", class: "hl-red", color: "#991b1b", bg: "#ef4444" },
  { name: "Orange", class: "hl-orange", color: "#9a3412", bg: "#fb923c" },
  { name: "Yellow", class: "hl-yellow", color: "#946800", bg: "#facc15" },
  { name: "Green", class: "hl-green", color: "#166534", bg: "#4ade80" },
  { name: "Cyan", class: "hl-cyan", color: "#155e75", bg: "#22d3ee" },
  { name: "Blue", class: "hl-blue", color: "#1e40af", bg: "#60a5fa" },
  { name: "Purple", class: "hl-purple", color: "#5b21b6", bg: "#a78bfa" }
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
      const selection2 = cmView2.state.selection.main;
      return { text, from: selection2.from, to: selection2.to };
    }
    const from = editor.getCursor("from");
    const to = editor.getCursor("to");
    return { text, from: editor.posToOffset(from), to: editor.posToOffset(to) };
  }
  const cmView = getCmView(editor);
  if (!cmView)
    return null;
  const selection = cmView.state.selection.main;
  if (selection.from !== selection.to) {
    const cmText = cmView.state.sliceDoc(selection.from, selection.to);
    if (cmText && cmText.trim().length > 0) {
      return { text: cmText, from: selection.from, to: selection.to };
    }
  }
  const domSelection = window.getSelection();
  if (!domSelection || domSelection.rangeCount === 0 || domSelection.isCollapsed) {
    return null;
  }
  const domText = domSelection.toString();
  if (!domText || !domText.trim())
    return null;
  let hintFrom = selection.from;
  let hintTo = selection.to;
  const range = domSelection.getRangeAt(0);
  if (cmView.posAtDOM) {
    try {
      hintFrom = cmView.posAtDOM(range.startContainer, range.startOffset);
      hintTo = cmView.posAtDOM(range.endContainer, range.endOffset);
    } catch (e) {
    }
  }
  return findClosestSelection(cmView.state.doc.toString(), domText, hintFrom, hintTo);
}
function replaceRange(editor, replacement, from, to) {
  const cmView = getCmView(editor);
  if (cmView) {
    cmView.dispatch({ changes: { from, to, insert: replacement } });
  } else {
    editor.replaceSelection(replacement);
  }
}
var RainbowHighlightPlugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.popover = null;
    this.currentSelection = null;
    this.selectionTimer = null;
    this.ignoreSelectionUntil = 0;
    this.pointerIsDown = false;
  }
  onload() {
    this.registerDomEvent(document, "pointerdown", () => {
      this.pointerIsDown = true;
    });
    this.registerDomEvent(document, "pointerup", () => {
      this.pointerIsDown = false;
      this.queueSelection(30);
    });
    this.registerDomEvent(document, "pointercancel", () => {
      this.pointerIsDown = false;
    });
    this.registerDomEvent(document, "selectionchange", () => {
      if (!this.pointerIsDown)
        this.queueSelection(80);
    });
    this.registerDomEvent(document, "keyup", (event) => {
      if (event.shiftKey)
        this.queueSelection(10);
    });
    this.registerDomEvent(document, "mousedown", (event) => {
      if (this.popover && !this.popover.contains(event.target)) {
        this.removePopover(true);
      }
    });
    this.registerDomEvent(document, "scroll", () => this.removePopover(true), true);
    this.registerDomEvent(window, "resize", () => this.removePopover(true));
    HIGHLIGHT_COLORS.forEach((color) => {
      this.addCommand({
        id: `highlight-${color.class}`,
        name: `Highlight background: ${color.name.toLowerCase()}`,
        editorCallback: (editor) => this.applyColor(editor, color, "bg")
      });
      this.addCommand({
        id: `text-${color.class}`,
        name: `Text color: ${color.name.toLowerCase()}`,
        editorCallback: (editor) => this.applyColor(editor, color, "text")
      });
    });
    this.addCommand({
      id: "remove-highlight",
      name: "Remove highlight",
      editorCallback: (editor) => this.removeHighlight(editor)
    });
  }
  onunload() {
    if (this.selectionTimer !== null)
      window.clearTimeout(this.selectionTimer);
    this.removePopover(true);
  }
  queueSelection(delay) {
    if (this.selectionTimer !== null)
      window.clearTimeout(this.selectionTimer);
    this.selectionTimer = window.setTimeout(() => {
      this.selectionTimer = null;
      this.handleSelection();
    }, delay);
  }
  handleSelection() {
    if (Date.now() < this.ignoreSelectionUntil)
      return;
    const activeView = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
    if (!activeView) {
      this.removePopover(true);
      return;
    }
    const domSelection = window.getSelection();
    const anchor = domSelection == null ? void 0 : domSelection.anchorNode;
    if (!anchor || !activeView.containerEl.contains(anchor)) {
      this.removePopover(true);
      return;
    }
    const editor = activeView.editor;
    const selectionInfo = getSelection(editor);
    if (!selectionInfo || !domSelection || domSelection.rangeCount === 0) {
      this.removePopover(true);
      return;
    }
    this.currentSelection = selectionInfo;
    const rect = domSelection.getRangeAt(0).getBoundingClientRect();
    this.showPopover(rect, editor);
  }
  showPopover(rect, editor) {
    this.removePopover(false);
    const popover = document.createElement("div");
    popover.addClass("hl-popover");
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
    if (top < 8)
      top = rect.bottom + 8;
    left = Math.max(8, Math.min(left, window.innerWidth - popoverRect.width - 8));
    popover.style.top = `${top}px`;
    popover.style.left = `${left}px`;
    this.popover = popover;
  }
  buildRow(editor, kind, labelText) {
    const row = document.createElement("div");
    row.addClass("hl-popover-row");
    const label = document.createElement("div");
    label.addClass("hl-row-icon");
    label.setAttribute("aria-label", labelText);
    label.setAttribute("title", labelText);
    (0, import_obsidian.setIcon)(label, kind === "bg" ? "highlighter" : "type");
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
        this.ignoreSelectionUntil = Date.now() + 250;
        this.applyColor(editor, color, kind);
        this.removePopover(true);
      });
      row.appendChild(circle);
    });
    return row;
  }
  buildRemoveButton(editor) {
    const button = document.createElement("button");
    button.addClass("hl-color-circle", "hl-remove-circle");
    button.setAttribute("aria-label", "Remove highlight");
    button.setAttribute("title", "Remove highlight");
    (0, import_obsidian.setIcon)(button, "x");
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.ignoreSelectionUntil = Date.now() + 250;
      this.removeHighlight(editor);
      this.removePopover(true);
    });
    return button;
  }
  removePopover(clearSelection) {
    var _a;
    (_a = this.popover) == null ? void 0 : _a.remove();
    this.popover = null;
    if (clearSelection)
      this.currentSelection = null;
  }
  applyColor(editor, color, kind) {
    var _a;
    let selectionInfo = (_a = this.currentSelection) != null ? _a : getSelection(editor);
    if (!selectionInfo)
      return;
    const cmView = getCmView(editor);
    if (cmView) {
      selectionInfo = expandToPluginMark(cmView.state.doc.toString(), selectionInfo);
    }
    const newClass = kind === "bg" ? color.class : color.class.replace(/^hl-/, "hlt-");
    const highlighted = applyColorToText(selectionInfo.text, newClass, kind);
    replaceRange(editor, highlighted, selectionInfo.from, selectionInfo.to);
    this.currentSelection = null;
  }
  removeHighlight(editor) {
    var _a;
    let selectionInfo = (_a = this.currentSelection) != null ? _a : getSelection(editor);
    const cmView = getCmView(editor);
    if (!selectionInfo && cmView) {
      selectionInfo = findPluginMarkAtOffset(
        cmView.state.doc.toString(),
        cmView.state.selection.main.from
      );
    }
    if (!selectionInfo)
      return;
    if (cmView) {
      selectionInfo = expandToPluginMark(cmView.state.doc.toString(), selectionInfo);
    }
    const cleaned = removeHighlightsFromText(selectionInfo.text);
    replaceRange(editor, cleaned, selectionInfo.from, selectionInfo.to);
    this.currentSelection = null;
  }
};
