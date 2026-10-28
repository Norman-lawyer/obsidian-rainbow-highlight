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
var import_obsidian2 = require("obsidian");

// highlight-utils.ts
var PLUGIN_CLASS = /^(?:hl|hlt)-[\w-]+$/;
var INLINE_WRAPPERS = ["***", "___", "**", "__", "~~", "*", "_"];
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
function parseNativeHighlights(documentText) {
  const highlights = [];
  let opening = -1;
  for (let index = 0; index < documentText.length - 1; index += 1) {
    if (documentText[index] !== "=" || documentText[index + 1] !== "=" || documentText[index - 1] === "\\")
      continue;
    if (opening < 0) {
      opening = index;
    } else if (index > opening + 2) {
      highlights.push({
        text: documentText.slice(opening, index + 2),
        from: opening,
        to: index + 2,
        innerFrom: opening + 2,
        innerTo: index
      });
      opening = -1;
    }
    index += 1;
  }
  return highlights;
}
function pluginTagRanges(documentText) {
  const ranges = [];
  for (const mark of parsePluginMarks(documentText)) {
    ranges.push(
      { from: mark.from, to: mark.innerFrom, kind: "open" },
      { from: mark.innerTo, to: mark.to, kind: "close" }
    );
  }
  return ranges.sort((a, b) => a.from - b.from || a.to - b.to);
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
function wrapInline(text, colorClass) {
  for (const wrapper of INLINE_WRAPPERS) {
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
function outerPluginMarks(documentText) {
  const marks = parsePluginMarks(documentText);
  return marks.filter(
    (mark) => !marks.some(
      (other) => other !== mark && other.from <= mark.from && other.to >= mark.to
    )
  );
}
function overlapsSelectedContent(mark, selection) {
  return Math.max(mark.innerFrom, selection.from) < Math.min(mark.innerTo, selection.to);
}
function mergeAdjacentPluginMarks(text) {
  const adjacent = /<mark class="([^"]+)">((?:(?!<\/mark>)[\s\S])*)<\/mark><mark class="\1">((?:(?!<\/mark>)[\s\S])*)<\/mark>/g;
  let previous;
  do {
    previous = text;
    text = text.replace(adjacent, '<mark class="$1">$2$3</mark>');
  } while (text !== previous);
  return text;
}
function effectivePluginClasses(stack) {
  const classes = [];
  for (const mark of stack) {
    for (const className of mark.classNames.split(/\s+/).filter(Boolean)) {
      if (className.startsWith("hlt-")) {
        for (let index = classes.length - 1; index >= 0; index -= 1) {
          if (classes[index].startsWith("hlt-"))
            classes.splice(index, 1);
        }
      } else if (className.startsWith("hl-")) {
        for (let index = classes.length - 1; index >= 0; index -= 1) {
          if (classes[index].startsWith("hl-"))
            classes.splice(index, 1);
        }
      } else if (classes.includes(className)) {
        continue;
      }
      classes.push(className);
    }
  }
  return classes;
}
function styledChunks(documentText, from, to) {
  const marks = parsePluginMarks(documentText).filter((mark) => mark.from >= from && mark.to <= to);
  const events = [];
  for (const mark of marks) {
    events.push(
      { from: mark.from, to: mark.innerFrom, type: "open", mark },
      { from: mark.innerTo, to: mark.to, type: "close", mark }
    );
  }
  events.sort(
    (a, b) => a.from - b.from || (a.type === "close" ? -1 : 1)
  );
  const chunks = [];
  const stack = [];
  let cursor = from;
  for (const event of events) {
    if (event.from > cursor) {
      chunks.push({
        from: cursor,
        to: event.from,
        classNames: effectivePluginClasses(stack)
      });
    }
    if (event.type === "open") {
      stack.push(event.mark);
    } else {
      const index = stack.lastIndexOf(event.mark);
      if (index >= 0)
        stack.splice(index, 1);
    }
    cursor = Math.max(cursor, event.to);
  }
  if (cursor < to) {
    chunks.push({
      from: cursor,
      to,
      classNames: effectivePluginClasses(stack)
    });
  }
  return chunks;
}
function editSelectionAcrossMarks(documentText, selection, transform) {
  const marks = outerPluginMarks(documentText).filter((mark) => overlapsSelectedContent(mark, selection));
  if (marks.length === 0) {
    return {
      from: selection.from,
      to: selection.to,
      insert: transform(selection.text, null)
    };
  }
  const editFrom = Math.min(selection.from, ...marks.map((mark) => mark.from));
  const editTo = Math.max(selection.to, ...marks.map((mark) => mark.to));
  let insert = "";
  for (const chunk of styledChunks(documentText, editFrom, editTo)) {
    const selectedFrom = Math.min(
      chunk.to,
      Math.max(chunk.from, selection.from)
    );
    const selectedTo = Math.min(
      chunk.to,
      Math.max(chunk.from, selection.to)
    );
    const wrapOriginal = (from, to) => {
      if (to <= from)
        return "";
      const value = documentText.slice(from, to);
      return chunk.classNames.length > 0 ? wrapWithClasses(value, chunk.classNames) : value;
    };
    insert += wrapOriginal(chunk.from, selectedFrom);
    if (selectedTo > selectedFrom) {
      insert += transform(
        documentText.slice(selectedFrom, selectedTo),
        chunk.classNames.length > 0 ? chunk.classNames.join(" ") : null
      );
    }
    insert += wrapOriginal(Math.max(selectedFrom, selectedTo), chunk.to);
  }
  return { from: editFrom, to: editTo, insert: mergeAdjacentPluginMarks(insert) };
}
function replaceColorClass(classNames, kind, newClass) {
  const classes = classNames.split(/\s+/).filter(Boolean).filter(
    (className) => kind === "bg" ? !className.startsWith("hl-") : !className.startsWith("hlt-")
  );
  if (newClass)
    classes.push(newClass);
  return classes;
}
function wrapWithClasses(text, classes) {
  const cleaned = removeHighlightsFromText(text);
  return classes.length > 0 ? `<mark class="${classes.join(" ")}">${cleaned}</mark>` : cleaned;
}
function splitNativeHighlight(documentText, highlight, selection) {
  var _a;
  const inner = documentText.slice(highlight.innerFrom, highlight.innerTo);
  const wrapper = (_a = INLINE_WRAPPERS.find(
    (candidate) => inner.length > candidate.length * 2 && inner.startsWith(candidate) && inner.endsWith(candidate)
  )) != null ? _a : "";
  const contentFrom = highlight.innerFrom + wrapper.length;
  const contentTo = highlight.innerTo - wrapper.length;
  const selectedFrom = Math.max(contentFrom, Math.min(contentTo, selection.from));
  const selectedTo = Math.max(selectedFrom, Math.min(contentTo, selection.to));
  const content = documentText.slice(contentFrom, contentTo);
  const relativeFrom = selectedFrom - contentFrom;
  const relativeTo = selectedTo - contentFrom;
  const before = content.slice(0, relativeFrom);
  const selected = content.slice(relativeFrom, relativeTo);
  const after = content.slice(relativeTo);
  return [
    wrapper,
    before ? `==${before}==` : "",
    removeHighlightsFromText(selected),
    after ? `==${after}==` : "",
    wrapper
  ].join("");
}
function removeNativeHighlightFromSelection(documentText, selection) {
  const highlights = parseNativeHighlights(documentText).filter(
    (highlight) => Math.max(highlight.innerFrom, selection.from) < Math.min(highlight.innerTo, selection.to)
  );
  if (highlights.length === 0)
    return null;
  const editFrom = Math.min(selection.from, ...highlights.map((mark) => mark.from));
  const editTo = Math.max(selection.to, ...highlights.map((mark) => mark.to));
  let insert = documentText.slice(editFrom, editTo);
  for (const highlight of [...highlights].sort((a, b) => b.from - a.from)) {
    const relativeFrom = highlight.from - editFrom;
    const relativeTo = highlight.to - editFrom;
    insert = insert.slice(0, relativeFrom) + splitNativeHighlight(documentText, highlight, selection) + insert.slice(relativeTo);
  }
  return { from: editFrom, to: editTo, insert };
}
function applyColorToSelection(documentText, selection, newClass, kind) {
  return editSelectionAcrossMarks(
    documentText,
    selection,
    (text, classNames) => classNames === null ? applyColorToText(text, newClass, kind) : wrapWithClasses(text, replaceColorClass(classNames, kind, newClass))
  );
}
function removeColorFromSelection(documentText, selection, kind) {
  if (kind === "bg") {
    const nativeEdit = removeNativeHighlightFromSelection(
      documentText,
      selection
    );
    if (nativeEdit)
      return nativeEdit;
  }
  return editSelectionAcrossMarks(
    documentText,
    selection,
    (text, classNames) => classNames === null ? removeHighlightsFromText(text) : wrapWithClasses(text, replaceColorClass(classNames, kind, null))
  );
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
function removeHighlightFromSelection(documentText, selection) {
  const nativeEdit = removeNativeHighlightFromSelection(
    documentText,
    selection
  );
  if (nativeEdit)
    return nativeEdit;
  return editSelectionAcrossMarks(
    documentText,
    selection,
    (text, classNames) => {
      if (classNames === null)
        return removeHighlightsFromText(text);
      const remaining = classNames.split(/\s+/).filter(Boolean).filter((className) => !PLUGIN_CLASS.test(className));
      return wrapWithClasses(text, remaining);
    }
  );
}
function uniformColor(values) {
  if (values.length === 0 || values[0] === null)
    return null;
  return values.every((value) => value === values[0]) ? values[0] : null;
}
function getSelectionColorState(documentText, selection) {
  var _a, _b;
  const marks = outerPluginMarks(documentText).filter((mark) => overlapsSelectedContent(mark, selection));
  const backgrounds = [];
  const textColors = [];
  const rangeFrom = marks.length > 0 ? Math.min(selection.from, ...marks.map((mark) => mark.from)) : selection.from;
  const rangeTo = marks.length > 0 ? Math.max(selection.to, ...marks.map((mark) => mark.to)) : selection.to;
  for (const chunk of styledChunks(documentText, rangeFrom, rangeTo)) {
    if (Math.max(chunk.from, selection.from) >= Math.min(chunk.to, selection.to))
      continue;
    const classes = chunk.classNames;
    backgrounds.push((_a = classes.find((name) => name.startsWith("hl-"))) != null ? _a : null);
    textColors.push((_b = classes.find((name) => name.startsWith("hlt-"))) != null ? _b : null);
  }
  return {
    bg: uniformColor(backgrounds),
    text: uniformColor(textColors)
  };
}
function protectedMarkdownRanges(documentText) {
  var _a;
  const ranges = [];
  const addMatches = (pattern) => {
    let match;
    while ((match = pattern.exec(documentText)) !== null) {
      ranges.push({ from: match.index, to: match.index + match[0].length });
      if (match[0].length === 0)
        pattern.lastIndex += 1;
    }
  };
  const frontmatter = documentText.match(
    /^(?:\uFEFF)?---[ \t]*\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/
  );
  if (frontmatter)
    ranges.push({ from: 0, to: frontmatter[0].length });
  let fence = null;
  const linePattern = /.*(?:\n|$)/g;
  let line;
  while ((line = linePattern.exec(documentText)) !== null && line[0]) {
    const content = line[0].replace(/\r?\n$/, "");
    const marker = (_a = content.match(/^ {0,3}(`{3,}|~{3,})/)) == null ? void 0 : _a[1];
    if (!fence && marker) {
      fence = { from: line.index, character: marker[0], length: marker.length };
    } else if (fence && new RegExp(`^ {0,3}${fence.character}{${fence.length},}[ \\t]*$`).test(content)) {
      ranges.push({ from: fence.from, to: line.index + line[0].length });
      fence = null;
    }
  }
  if (fence)
    ranges.push({ from: fence.from, to: documentText.length });
  addMatches(/!?\[\[[\s\S]*?\]\]/g);
  addMatches(/(`+)([\s\S]*?)\1/g);
  addMatches(/\$\$[\s\S]*?\$\$/g);
  for (let index = 0; index < documentText.length; index += 1) {
    if (documentText[index] !== "$" || documentText[index - 1] === "\\" || documentText[index + 1] === "$")
      continue;
    for (let end = index + 1; end < documentText.length; end += 1) {
      if (documentText[end] === "\n")
        break;
      if (documentText[end] === "$" && documentText[end - 1] !== "\\" && documentText[end + 1] !== "$") {
        ranges.push({ from: index, to: end + 1 });
        index = end;
        break;
      }
    }
  }
  return ranges;
}
function selectionOverlapsProtectedMarkdown(documentText, selection) {
  return protectedMarkdownRanges(documentText).some(
    (range) => selection.from < range.to && selection.to > range.from
  );
}

// selection-ui.ts
function getPaletteRemoveAction(kind) {
  return kind === "bg" ? "all" : "text";
}
function getPaletteRemoveIcon(action) {
  return action === "all" ? "eraser" : "remove-formatting";
}
function shouldQueueSelectionAfterPointerUp(popover, target) {
  return !popover || !popover.contains(target);
}
function shouldQueueSelectionAfterPointerCancel(pointerWasDown) {
  return pointerWasDown;
}
function hasUsableSelectionRect(rect) {
  return [rect.top, rect.right, rect.bottom, rect.left, rect.width, rect.height].every(Number.isFinite) && (rect.width > 0 || rect.height > 0);
}
function positionSelectionPopover(rect, popover, viewport, padding = 8) {
  const preferredTop = rect.top - popover.height - padding >= padding ? rect.top - popover.height - padding : rect.bottom + padding;
  const maxTop = Math.max(padding, viewport.height - popover.height - padding);
  const preferredLeft = rect.left + rect.width / 2 - popover.width / 2;
  const maxLeft = Math.max(padding, viewport.width - popover.width - padding);
  return {
    top: Math.max(padding, Math.min(preferredTop, maxTop)),
    left: Math.max(padding, Math.min(preferredLeft, maxLeft))
  };
}
function replaceExactSourceRange(source, selection, replacement) {
  if (selection.from < 0 || selection.to < selection.from || selection.to > source.length || source.slice(selection.from, selection.to) !== selection.text) {
    return null;
  }
  return source.slice(0, selection.from) + replacement + source.slice(selection.to);
}

// palette.ts
var HIGHLIGHT_COLORS = [
  { id: "red", name: "Red", class: "hl-red", color: "#991b1b", bg: "#ef4444" },
  { id: "orange", name: "Orange", class: "hl-orange", color: "#9a3412", bg: "#fb923c" },
  { id: "yellow", name: "Yellow", class: "hl-yellow", color: "#946800", bg: "#facc15" },
  { id: "green", name: "Green", class: "hl-green", color: "#166534", bg: "#4ade80" },
  { id: "cyan", name: "Cyan", class: "hl-cyan", color: "#155e75", bg: "#22d3ee" },
  { id: "blue", name: "Blue", class: "hl-blue", color: "#1e40af", bg: "#60a5fa" },
  { id: "purple", name: "Purple", class: "hl-purple", color: "#5b21b6", bg: "#a78bfa" }
];
var DEFAULT_SETTINGS = {
  enabledColorIds: HIGHLIGHT_COLORS.map((color) => color.id),
  autoOpenPalette: true,
  popupDelay: 40,
  hasSeenWelcome: false
};
function isRecord(value) {
  return typeof value === "object" && value !== null;
}
function normalizeSettings(raw) {
  const data = isRecord(raw) ? raw : {};
  const validIds = new Set(HIGHLIGHT_COLORS.map((color) => color.id));
  const enabledColorIds = Array.isArray(data.enabledColorIds) ? Array.from(new Set(
    data.enabledColorIds.filter(
      (id) => typeof id === "string" && validIds.has(id)
    )
  )) : [];
  const savedDelay = typeof data.popupDelay === "number" && Number.isFinite(data.popupDelay) ? Math.round(data.popupDelay) : DEFAULT_SETTINGS.popupDelay;
  return {
    enabledColorIds: enabledColorIds.length > 0 ? enabledColorIds : [...DEFAULT_SETTINGS.enabledColorIds],
    autoOpenPalette: typeof data.autoOpenPalette === "boolean" ? data.autoOpenPalette : DEFAULT_SETTINGS.autoOpenPalette,
    popupDelay: Math.max(0, Math.min(200, savedDelay)),
    hasSeenWelcome: typeof data.hasSeenWelcome === "boolean" ? data.hasSeenWelcome : DEFAULT_SETTINGS.hasSeenWelcome
  };
}
function getEnabledHighlightColors(settings) {
  const enabled = new Set(settings.enabledColorIds);
  return HIGHLIGHT_COLORS.filter((color) => enabled.has(color.id));
}

// settings-tab.ts
var import_obsidian = require("obsidian");
var RainbowHighlightSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, owner) {
    super(app, owner);
    this.owner = owner;
  }
  getControlValue(key) {
    if (key === "autoOpenPalette")
      return this.owner.settings.autoOpenPalette;
    if (key === "popupDelay")
      return this.owner.settings.popupDelay;
    return void 0;
  }
  async setControlValue(key, value) {
    if (key === "autoOpenPalette" && typeof value === "boolean") {
      await this.owner.updateSettings({ autoOpenPalette: value });
      return;
    }
    if (key === "popupDelay" && typeof value === "number") {
      await this.owner.updateSettings({ popupDelay: value });
    }
  }
  getSettingDefinitions() {
    return [
      {
        name: "Rainbow Highlight",
        desc: "Tune the palette without changing existing highlights. \u81EA\u5B9A\u4E49\u8C03\u8272\u76D8\uFF0C\u4E0D\u4F1A\u5F71\u54CD\u5DF2\u6709\u9AD8\u4EAE\u3002",
        searchable: false,
        render: (setting) => {
          this.containerEl.addClass("rainbow-highlight-settings");
          setting.setName("Rainbow Highlight").setDesc(
            "Tune the palette without changing existing highlights. \u81EA\u5B9A\u4E49\u8C03\u8272\u76D8\uFF0C\u4E0D\u4F1A\u5F71\u54CD\u5DF2\u6709\u9AD8\u4EAE\u3002"
          ).setHeading().setClass("rainbow-highlight-settings-header");
        }
      },
      {
        type: "group",
        heading: "Behavior / \u4EA4\u4E92",
        items: [
          {
            name: "Auto-open palette / \u81EA\u52A8\u6253\u5F00\u8C03\u8272\u76D8",
            desc: "Show the palette after selecting text. \u9009\u4E2D\u6587\u5B57\u540E\u81EA\u52A8\u663E\u793A\u8C03\u8272\u76D8\u3002",
            control: {
              type: "toggle",
              key: "autoOpenPalette"
            }
          },
          {
            name: "Palette delay / \u8C03\u8272\u76D8\u5EF6\u65F6",
            desc: "A short delay helps complex selections settle. \u9002\u5F53\u5EF6\u65F6\u53EF\u63D0\u9AD8\u590D\u6742\u9009\u533A\u7684\u7A33\u5B9A\u6027\u3002",
            control: {
              type: "slider",
              key: "popupDelay",
              min: 0,
              max: 200,
              step: 10,
              displayFormat: (value) => `${value} ms`
            }
          }
        ]
      },
      {
        type: "group",
        heading: "Palette colors / \u8C03\u8272\u76D8\u914D\u8272",
        items: [
          {
            name: "About hidden colors / \u9690\u85CF\u914D\u8272\u8BF4\u660E",
            desc: "Hidden colors remain available as commands and existing notes keep their appearance. \u9690\u85CF\u7684\u989C\u8272\u4ECD\u53EF\u901A\u8FC7\u547D\u4EE4\u4F7F\u7528\uFF0C\u4E5F\u4E0D\u4F1A\u6539\u53D8\u65E7\u7B14\u8BB0\u3002",
            searchable: false
          },
          ...HIGHLIGHT_COLORS.map((color) => ({
            name: color.name,
            desc: `${color.class} / ${color.class.replace(/^hl-/, "hlt-")}`,
            render: (setting) => {
              setting.setName(color.name).setDesc(
                `${color.class} / ${color.class.replace(/^hl-/, "hlt-")}`
              ).setClass("rainbow-highlight-color-setting");
              const swatch = setting.nameEl.createSpan({
                cls: "rainbow-highlight-swatch",
                attr: { "aria-hidden": "true" }
              });
              swatch.setCssProps({ "--rainbow-highlight-swatch": color.bg });
              setting.nameEl.prepend(swatch);
              setting.addToggle((toggle) => {
                toggle.setValue(
                  this.owner.settings.enabledColorIds.includes(color.id)
                ).onChange(async (enabled) => {
                  const current = this.owner.settings.enabledColorIds;
                  if (!enabled && current.length === 1 && current.includes(color.id)) {
                    toggle.setValue(true);
                    new import_obsidian.Notice(
                      "Keep at least one palette color. / \u8BF7\u81F3\u5C11\u4FDD\u7559\u4E00\u79CD\u989C\u8272\u3002"
                    );
                    return;
                  }
                  const enabledColorIds = enabled ? [...current, color.id] : current.filter((id) => id !== color.id);
                  await this.owner.updateSettings({ enabledColorIds });
                });
              });
            }
          }))
        ]
      },
      {
        name: "Reset settings / \u6062\u590D\u9ED8\u8BA4",
        desc: "Restore all seven colors and the default palette behavior. \u6062\u590D 7 \u79CD\u914D\u8272\u548C\u9ED8\u8BA4\u4EA4\u4E92\u3002",
        render: (setting) => {
          setting.setName("Reset settings / \u6062\u590D\u9ED8\u8BA4").setDesc(
            "Restore all seven colors and the default palette behavior. \u6062\u590D 7 \u79CD\u914D\u8272\u548C\u9ED8\u8BA4\u4EA4\u4E92\u3002"
          ).addButton((button) => {
            button.setButtonText("Reset / \u91CD\u7F6E").onClick(async () => {
              await this.owner.updateSettings({
                enabledColorIds: [...DEFAULT_SETTINGS.enabledColorIds],
                autoOpenPalette: DEFAULT_SETTINGS.autoOpenPalette,
                popupDelay: DEFAULT_SETTINGS.popupDelay
              });
              this.update();
              new import_obsidian.Notice("Settings reset. / \u8BBE\u7F6E\u5DF2\u91CD\u7F6E\u3002");
            });
          });
        }
      }
    ];
  }
};

// main.ts
function getCmView(editor) {
  var _a;
  return (_a = editor.cm) != null ? _a : null;
}
function getDomSelection(editor, sourceText) {
  const cmView = getCmView(editor);
  if (!cmView)
    return null;
  const domSelection = activeWindow.getSelection();
  if (!domSelection || domSelection.rangeCount === 0 || domSelection.isCollapsed) {
    return null;
  }
  const domText = domSelection.toString();
  if (!domText || !domText.trim())
    return null;
  const editorSelection = cmView.state.selection.main;
  let hintFrom = editorSelection.from;
  let hintTo = editorSelection.to;
  const range = domSelection.getRangeAt(0);
  if (cmView.posAtDOM) {
    try {
      hintFrom = cmView.posAtDOM(range.startContainer, range.startOffset);
      hintTo = cmView.posAtDOM(range.endContainer, range.endOffset);
    } catch (e) {
    }
  }
  return findClosestSelection(
    sourceText != null ? sourceText : cmView.state.doc.toString(),
    domText,
    hintFrom,
    hintTo
  );
}
function getSelection(editor, preferDomSelection = false, sourceText) {
  if (preferDomSelection) {
    const domSelection = getDomSelection(editor, sourceText);
    if (domSelection)
      return domSelection;
  }
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
  return getDomSelection(editor);
}
var RainbowHighlightPlugin = class extends import_obsidian2.Plugin {
  constructor() {
    super(...arguments);
    this.settings = {
      ...DEFAULT_SETTINGS,
      enabledColorIds: [...DEFAULT_SETTINGS.enabledColorIds]
    };
    this.popover = null;
    this.currentSelection = null;
    this.selectionTimer = null;
    this.ignoreSelectionUntil = 0;
    this.pointerIsDown = false;
  }
  async onload() {
    await this.loadSettings();
    this.addSettingTab(new RainbowHighlightSettingTab(this.app, this));
    this.registerDomEvent(activeDocument, "pointerdown", () => {
      this.pointerIsDown = true;
    });
    this.registerDomEvent(activeDocument, "pointerup", (event) => {
      this.pointerIsDown = false;
      if (shouldQueueSelectionAfterPointerUp(
        this.popover,
        event.target
      )) {
        this.queueSelection(this.settings.popupDelay);
      }
    });
    this.registerDomEvent(activeDocument, "pointercancel", () => {
      const pointerWasDown = this.pointerIsDown;
      this.pointerIsDown = false;
      if (shouldQueueSelectionAfterPointerCancel(pointerWasDown)) {
        this.queueSelection(this.settings.popupDelay);
      }
    });
    this.registerDomEvent(activeDocument, "mouseup", (event) => {
      if (!this.pointerIsDown)
        return;
      this.pointerIsDown = false;
      if (shouldQueueSelectionAfterPointerUp(
        this.popover,
        event.target
      )) {
        this.queueSelection(this.settings.popupDelay);
      }
    });
    this.registerDomEvent(activeDocument, "selectionchange", () => {
      if (!this.pointerIsDown)
        this.queueSelection(this.settings.popupDelay);
    });
    this.registerDomEvent(activeDocument, "keyup", (event) => {
      if (event.shiftKey)
        this.queueSelection(this.settings.popupDelay);
    });
    this.registerDomEvent(activeDocument, "mousedown", (event) => {
      if (this.popover && !this.popover.contains(event.target)) {
        this.removePopover(true);
      }
    });
    this.registerDomEvent(
      activeDocument,
      "scroll",
      () => this.removePopover(true),
      true
    );
    this.registerDomEvent(activeWindow, "resize", () => this.removePopover(true));
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
      id: "show-color-palette",
      name: "Show color palette",
      editorCallback: (editor) => this.showPaletteFromCommand(editor)
    });
    this.addCommand({
      id: "remove-highlight",
      name: "Remove highlight",
      editorCallback: (editor) => this.removeHighlight(editor)
    });
    this.addCommand({
      id: "remove-background-color",
      name: "Remove background color",
      editorCallback: (editor) => this.removeColor(editor, "bg")
    });
    this.addCommand({
      id: "remove-text-color",
      name: "Remove text color",
      editorCallback: (editor) => this.removeColor(editor, "text")
    });
    this.app.workspace.onLayoutReady(() => {
      void this.showWelcomeOnce();
    });
  }
  onunload() {
    if (this.selectionTimer !== null) {
      window.clearTimeout(this.selectionTimer);
    }
    this.removePopover(true);
  }
  queueSelection(delay) {
    if (this.selectionTimer !== null) {
      window.clearTimeout(this.selectionTimer);
    }
    this.selectionTimer = window.setTimeout(() => {
      this.selectionTimer = null;
      this.handleSelection();
    }, delay);
  }
  handleSelection() {
    var _a;
    if (Date.now() < this.ignoreSelectionUntil)
      return;
    if (!this.settings.autoOpenPalette) {
      this.removePopover(true);
      return;
    }
    const activeView = this.app.workspace.getActiveViewOfType(import_obsidian2.MarkdownView);
    if (!activeView) {
      this.removePopover(true);
      return;
    }
    const domSelection = activeWindow.getSelection();
    const anchor = domSelection == null ? void 0 : domSelection.anchorNode;
    if (!anchor || !activeView.containerEl.contains(anchor)) {
      this.removePopover(true);
      return;
    }
    const editor = activeView.editor;
    const isPreview = activeView.getMode() === "preview";
    const sourceText = isPreview ? activeView.getViewData() : (_a = getCmView(editor)) == null ? void 0 : _a.state.doc.toString();
    const selectionInfo = getSelection(
      editor,
      isPreview,
      sourceText
    );
    if (!selectionInfo || !domSelection || domSelection.rangeCount === 0) {
      this.removePopover(true);
      return;
    }
    if (sourceText && selectionOverlapsProtectedMarkdown(sourceText, selectionInfo)) {
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
  showPopover(rect, editor) {
    this.removePopover(false);
    const popover = createDiv({ cls: "hl-popover" });
    popover.setAttribute("role", "toolbar");
    popover.setAttribute("aria-label", "Rainbow Highlight colors");
    popover.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    popover.addEventListener("keydown", (event) => {
      var _a;
      if (event.key === "Escape") {
        event.preventDefault();
        this.removePopover(true);
        return;
      }
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
        return;
      }
      const buttons = Array.from(
        popover.querySelectorAll("button")
      );
      const current = buttons.indexOf(
        activeDocument.activeElement
      );
      if (current < 0)
        return;
      const step = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
      event.preventDefault();
      (_a = buttons[(current + step + buttons.length) % buttons.length]) == null ? void 0 : _a.focus();
    });
    const container = createDiv({ cls: "hl-popover-colors" });
    const sourceText = this.getSourceText(editor);
    const colorState = sourceText && this.currentSelection ? getSelectionColorState(sourceText, this.currentSelection) : { bg: null, text: null };
    const backgroundRow = this.buildRow(
      editor,
      "bg",
      "Background",
      colorState.bg
    );
    backgroundRow.appendChild(
      this.buildRemoveButton(editor, getPaletteRemoveAction("bg"))
    );
    container.appendChild(backgroundRow);
    const textRow = this.buildRow(editor, "text", "Text", colorState.text);
    textRow.appendChild(
      this.buildRemoveButton(editor, getPaletteRemoveAction("text"))
    );
    container.appendChild(textRow);
    popover.appendChild(container);
    activeDocument.body.appendChild(popover);
    const popoverRect = popover.getBoundingClientRect();
    const position = positionSelectionPopover(
      rect,
      popoverRect,
      { width: activeWindow.innerWidth, height: activeWindow.innerHeight }
    );
    popover.setCssStyles({
      top: `${position.top}px`,
      left: `${position.left}px`
    });
    this.popover = popover;
  }
  buildRow(editor, kind, labelText, activeClass) {
    const row = createDiv({ cls: "hl-popover-row" });
    const label = createDiv({ cls: "hl-row-icon" });
    label.setAttribute("aria-label", labelText);
    label.setAttribute("title", labelText);
    (0, import_obsidian2.setIcon)(label, kind === "bg" ? "highlighter" : "type");
    const visibleLabel = createSpan({
      cls: "hl-row-label-text",
      text: labelText
    });
    label.appendChild(visibleLabel);
    row.appendChild(label);
    getEnabledHighlightColors(this.settings).forEach((color) => {
      const circle = createEl("button", { cls: "hl-color-circle" });
      const colorClass = kind === "bg" ? color.class : color.class.replace(/^hl-/, "hlt-");
      const isActive = activeClass === colorClass;
      const tooltip = isActive ? `Remove ${labelText.toLowerCase()}: ${color.name.toLowerCase()}` : `${labelText}: ${color.name.toLowerCase()}`;
      circle.setAttribute("aria-label", tooltip);
      circle.setAttribute("title", tooltip);
      circle.setAttribute("aria-pressed", String(isActive));
      if (isActive)
        circle.addClass("is-active");
      if (kind === "bg") {
        circle.setCssProps({
          "--circle-bg": color.bg,
          "--circle-border": color.color
        });
      } else {
        circle.addClass("hl-text-circle");
        circle.setCssProps({ "--circle-text": color.bg });
        circle.setText("A");
      }
      circle.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.suppressSelectionHandling();
        const action = isActive ? this.removeColor(editor, kind) : this.applyColor(editor, color, kind);
        void this.finishPaletteAction(action);
      });
      row.appendChild(circle);
    });
    return row;
  }
  showPaletteFromCommand(editor) {
    var _a, _b;
    const activeView = this.app.workspace.getActiveViewOfType(import_obsidian2.MarkdownView);
    const selectionInfo = getSelection(editor);
    if (!activeView || !selectionInfo) {
      new import_obsidian2.Notice("Select text first. / \u8BF7\u5148\u9009\u4E2D\u6587\u5B57\u3002");
      return;
    }
    const sourceText = this.getSourceText(editor);
    if (sourceText && selectionOverlapsProtectedMarkdown(sourceText, selectionInfo)) {
      new import_obsidian2.Notice(
        "Highlighting is unavailable inside code, math, links, or properties."
      );
      return;
    }
    let rect = null;
    const domSelection = activeWindow.getSelection();
    if ((domSelection == null ? void 0 : domSelection.anchorNode) && domSelection.rangeCount > 0 && activeView.containerEl.contains(domSelection.anchorNode)) {
      const rangeRect = domSelection.getRangeAt(0).getBoundingClientRect();
      if (hasUsableSelectionRect(rangeRect))
        rect = rangeRect;
    }
    if (!rect) {
      const cmView = getCmView(editor);
      const start = (_a = cmView == null ? void 0 : cmView.coordsAtPos) == null ? void 0 : _a.call(cmView, selectionInfo.from);
      const end = (_b = cmView == null ? void 0 : cmView.coordsAtPos) == null ? void 0 : _b.call(cmView, selectionInfo.to);
      if (start && end) {
        const left = Math.min(start.left, end.left);
        const right = Math.max(start.right, end.right);
        const top = Math.min(start.top, end.top);
        const bottom = Math.max(start.bottom, end.bottom);
        rect = {
          top,
          right,
          bottom,
          left,
          width: right - left,
          height: bottom - top
        };
      }
    }
    if (!rect || !hasUsableSelectionRect(rect)) {
      new import_obsidian2.Notice("Unable to locate the selection. / \u65E0\u6CD5\u5B9A\u4F4D\u5F53\u524D\u9009\u533A\u3002");
      return;
    }
    this.currentSelection = selectionInfo;
    this.showPopover(rect, editor);
  }
  buildRemoveButton(editor, action) {
    const button = createEl("button", {
      cls: ["hl-color-circle", "hl-remove-circle"]
    });
    const label = action === "text" ? "Remove text color" : "Remove highlight";
    button.setAttribute("aria-label", label);
    button.setAttribute("title", label);
    button.dataset.action = action === "text" ? "remove-text" : "remove-all";
    (0, import_obsidian2.setIcon)(button, getPaletteRemoveIcon(action));
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.suppressSelectionHandling();
      const removal = action === "text" ? this.removeColor(editor, "text") : this.removeHighlight(editor);
      void this.finishPaletteAction(removal);
    });
    return button;
  }
  removePopover(clearSelection) {
    var _a;
    (_a = this.popover) == null ? void 0 : _a.remove();
    this.popover = null;
    if (clearSelection) {
      this.currentSelection = null;
      if (this.selectionTimer !== null) {
        window.clearTimeout(this.selectionTimer);
        this.selectionTimer = null;
      }
    }
  }
  suppressSelectionHandling() {
    this.ignoreSelectionUntil = Date.now() + 350;
    if (this.selectionTimer !== null) {
      window.clearTimeout(this.selectionTimer);
      this.selectionTimer = null;
    }
  }
  clearDomSelection() {
    const selection = activeWindow.getSelection();
    if (selection && !selection.isCollapsed)
      selection.removeAllRanges();
  }
  async finishPaletteAction(action) {
    try {
      await action;
    } finally {
      this.removePopover(true);
    }
  }
  getSourceText(editor) {
    var _a, _b;
    const activeView = this.app.workspace.getActiveViewOfType(import_obsidian2.MarkdownView);
    if ((activeView == null ? void 0 : activeView.getMode()) === "preview")
      return activeView.getViewData();
    return (_b = (_a = getCmView(editor)) == null ? void 0 : _a.state.doc.toString()) != null ? _b : null;
  }
  async replaceRange(editor, replacement, selectionInfo) {
    const activeView = this.app.workspace.getActiveViewOfType(import_obsidian2.MarkdownView);
    if ((activeView == null ? void 0 : activeView.getMode()) === "preview" && activeView.file) {
      try {
        await this.app.vault.process(activeView.file, (source) => {
          const updated = replaceExactSourceRange(
            source,
            selectionInfo,
            replacement
          );
          if (updated === null)
            throw new Error("The note changed after selection");
          return updated;
        });
        return true;
      } catch (e) {
        new import_obsidian2.Notice("Selection changed; please select the text again.");
        return false;
      }
    }
    const cmView = getCmView(editor);
    if (cmView) {
      cmView.dispatch({
        changes: {
          from: selectionInfo.from,
          to: selectionInfo.to,
          insert: replacement
        }
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
  async applyColor(editor, color, kind) {
    var _a;
    let selectionInfo = (_a = this.currentSelection) != null ? _a : getSelection(editor);
    if (!selectionInfo)
      return;
    const sourceText = this.getSourceText(editor);
    if (sourceText && selectionOverlapsProtectedMarkdown(sourceText, selectionInfo)) {
      new import_obsidian2.Notice(
        "Highlighting is unavailable inside code, math, links, or properties."
      );
      this.currentSelection = null;
      return;
    }
    const newClass = kind === "bg" ? color.class : color.class.replace(/^hl-/, "hlt-");
    const edit = sourceText ? applyColorToSelection(sourceText, selectionInfo, newClass, kind) : {
      from: selectionInfo.from,
      to: selectionInfo.to,
      insert: applyColorToText(selectionInfo.text, newClass, kind)
    };
    const editSelection = {
      from: edit.from,
      to: edit.to,
      text: sourceText ? sourceText.slice(edit.from, edit.to) : selectionInfo.text
    };
    if (await this.replaceRange(editor, edit.insert, editSelection)) {
      this.clearDomSelection();
    }
    this.currentSelection = null;
  }
  async removeColor(editor, kind) {
    const selectionInfo = this.getSelectionOrContainingMark(editor);
    if (!selectionInfo)
      return;
    const sourceText = this.getSourceText(editor);
    const edit = sourceText ? removeColorFromSelection(sourceText, selectionInfo, kind) : {
      from: selectionInfo.from,
      to: selectionInfo.to,
      insert: removeColorFromSelection(
        selectionInfo.text,
        { text: selectionInfo.text, from: 0, to: selectionInfo.text.length },
        kind
      ).insert
    };
    const editSelection = {
      from: edit.from,
      to: edit.to,
      text: sourceText ? sourceText.slice(edit.from, edit.to) : selectionInfo.text
    };
    if (await this.replaceRange(editor, edit.insert, editSelection)) {
      this.clearDomSelection();
    }
    this.currentSelection = null;
  }
  getSelectionOrContainingMark(editor) {
    var _a;
    const selectionInfo = (_a = this.currentSelection) != null ? _a : getSelection(editor);
    if (selectionInfo)
      return selectionInfo;
    const cmView = getCmView(editor);
    return cmView ? findPluginMarkAtOffset(
      cmView.state.doc.toString(),
      cmView.state.selection.main.from
    ) : null;
  }
  async removeHighlight(editor) {
    const selectionInfo = this.getSelectionOrContainingMark(editor);
    if (!selectionInfo)
      return;
    const sourceText = this.getSourceText(editor);
    const edit = sourceText ? removeHighlightFromSelection(sourceText, selectionInfo) : {
      from: selectionInfo.from,
      to: selectionInfo.to,
      insert: removeHighlightsFromText(selectionInfo.text)
    };
    const editSelection = {
      from: edit.from,
      to: edit.to,
      text: sourceText ? sourceText.slice(edit.from, edit.to) : selectionInfo.text
    };
    if (await this.replaceRange(editor, edit.insert, editSelection)) {
      this.clearDomSelection();
    }
    this.currentSelection = null;
  }
  async updateSettings(patch) {
    this.settings = normalizeSettings({ ...this.settings, ...patch });
    await this.saveData(this.settings);
    this.removePopover(true);
  }
  async loadSettings() {
    this.settings = normalizeSettings(await this.loadData());
  }
  async showWelcomeOnce() {
    if (this.settings.hasSeenWelcome)
      return;
    new import_obsidian2.Notice(
      "Select text to open the palette. Active colors can be removed with one click. / \u9009\u4E2D\u6587\u5B57\u5373\u53EF\u6253\u5F00\u8C03\u8272\u76D8\uFF0C\u70B9\u51FB\u5DF2\u9009\u989C\u8272\u53EF\u76F4\u63A5\u53D6\u6D88\u3002",
      8e3
    );
    await this.updateSettings({ hasSeenWelcome: true });
  }
};
