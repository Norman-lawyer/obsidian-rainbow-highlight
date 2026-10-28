export type HighlightKind = "bg" | "text";

export interface SelectionInfo {
  text: string;
  from: number;
  to: number;
}

export interface TextEdit {
  from: number;
  to: number;
  insert: string;
}

export interface SelectionColorState {
  bg: string | null;
  text: string | null;
}

const PLUGIN_CLASS = /^(?:hl|hlt)-[\w-]+$/;
const INLINE_WRAPPERS = ["***", "___", "**", "__", "~~", "*", "_"];

interface PluginMark extends SelectionInfo {
  classNames: string;
  innerFrom: number;
  innerTo: number;
}

interface NativeHighlight extends SelectionInfo {
  innerFrom: number;
  innerTo: number;
}

interface HiddenRange {
  from: number;
  to: number;
  kind: "open" | "close";
}

function calloutCandidates(text: string): string[] {
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

function findOccurrences(text: string, candidate: string): number[] {
  const occurrences: number[] = [];
  let index = text.indexOf(candidate);
  while (index >= 0) {
    occurrences.push(index);
    index = text.indexOf(candidate, index + 1);
  }
  return occurrences;
}

/** Locate the occurrence nearest the editor/DOM position instead of always
 * mutating the first identical sentence in the note. */
export function findClosestSelection(
  documentText: string,
  selectedText: string,
  hintFrom: number,
  hintTo = hintFrom
): SelectionInfo | null {
  let best: SelectionInfo | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  const rangeStart = Math.min(hintFrom, hintTo);
  const rangeEnd = Math.max(hintFrom, hintTo);

  const consider = (from: number, to: number) => {
    const distance = to < rangeStart
      ? rangeStart - to
      : from > rangeEnd
        ? from - rangeEnd
        : 0;

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

  // Rendered selections omit our HTML tags. Search a tag-free view while
  // retaining a map back to the exact source range, including boundary tags.
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

function hasPluginClass(classNames: string): boolean {
  return classNames.split(/\s+/).some((name) => PLUGIN_CLASS.test(name));
}

function parsePluginMarks(documentText: string): PluginMark[] {
  const tagPattern = /<mark(?:\s+class="([^"]*)")?\s*>|<\/mark>/g;
  const stack: Array<{
    from: number;
    innerFrom: number;
    classNames: string;
    plugin: boolean;
  }> = [];
  const marks: PluginMark[] = [];
  let match: RegExpExecArray | null;

  while ((match = tagPattern.exec(documentText)) !== null) {
    if (!match[0].startsWith("</")) {
      const classNames = match[1] ?? "";
      stack.push({
        from: match.index,
        innerFrom: tagPattern.lastIndex,
        classNames,
        plugin: hasPluginClass(classNames),
      });
      continue;
    }

    const opening = stack.pop();
    if (!opening?.plugin) continue;
    marks.push({
      text: documentText.slice(opening.from, tagPattern.lastIndex),
      from: opening.from,
      to: tagPattern.lastIndex,
      classNames: opening.classNames,
      innerFrom: opening.innerFrom,
      innerTo: match.index,
    });
  }

  return marks.sort((a, b) => a.from - b.from || b.to - a.to);
}

/** Parse Obsidian's ==highlight== syntax without treating escaped markers as
 * formatting. Native highlights are intentionally kept separate from plugin
 * marks because their source delimiters must be split around partial edits. */
function parseNativeHighlights(documentText: string): NativeHighlight[] {
  const highlights: NativeHighlight[] = [];
  let opening = -1;

  for (let index = 0; index < documentText.length - 1; index += 1) {
    if (
      documentText[index] !== "=" ||
      documentText[index + 1] !== "=" ||
      documentText[index - 1] === "\\"
    ) continue;

    if (opening < 0) {
      opening = index;
    } else if (index > opening + 2) {
      highlights.push({
        text: documentText.slice(opening, index + 2),
        from: opening,
        to: index + 2,
        innerFrom: opening + 2,
        innerTo: index,
      });
      opening = -1;
    }
    index += 1;
  }

  return highlights;
}

function pluginTagRanges(documentText: string): HiddenRange[] {
  const ranges: HiddenRange[] = [];
  for (const mark of parsePluginMarks(documentText)) {
    ranges.push(
      { from: mark.from, to: mark.innerFrom, kind: "open" },
      { from: mark.innerTo, to: mark.to, kind: "close" }
    );
  }
  return ranges.sort((a, b) => a.from - b.from || a.to - b.to);
}

function buildSearchView(documentText: string): {
  text: string;
  starts: number[];
  ends: number[];
} {
  const hiddenRanges = pluginTagRanges(documentText);
  let text = "";
  const starts: number[] = [];
  const ends: number[] = [];
  let sourceIndex = 0;
  let rangeIndex = 0;
  let pendingStart: number | null = null;

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
    starts.push(pendingStart ?? sourceIndex);
    ends.push(sourceIndex + 1);
    pendingStart = null;
    sourceIndex += 1;
  }

  return { text, starts, ends };
}

export function findPluginMarkAtOffset(
  documentText: string,
  offset: number
): SelectionInfo | null {
  const candidates = parsePluginMarks(documentText)
    .filter((mark) => offset >= mark.innerFrom && offset <= mark.innerTo)
    .sort((a, b) => (a.to - a.from) - (b.to - b.from));
  const mark = candidates[0];
  return mark ? { text: mark.text, from: mark.from, to: mark.to } : null;
}

/** Include the containing source wrapper so partial recolouring affects one
 * complete highlight instead of producing nested tags. */
export function expandToPluginMark(
  documentText: string,
  selection: SelectionInfo
): SelectionInfo {
  const candidates = parsePluginMarks(documentText)
    .filter((mark) => selection.from >= mark.innerFrom && selection.to <= mark.innerTo)
    .sort((a, b) => (a.to - a.from) - (b.to - b.from));
  const mark = candidates[0];
  return mark ? { text: mark.text, from: mark.from, to: mark.to } : selection;
}

function wrapInline(text: string, colorClass: string): string {
  for (const wrapper of INLINE_WRAPPERS) {
    if (
      text.length > wrapper.length * 2 &&
      text.startsWith(wrapper) &&
      text.endsWith(wrapper)
    ) {
      const inner = text.slice(wrapper.length, -wrapper.length);
      return `${wrapper}<mark class="${colorClass}">${inner}</mark>${wrapper}`;
    }
  }

  // Replace Obsidian's native ==highlight== instead of stacking two highlights.
  if (text.length > 4 && text.startsWith("==") && text.endsWith("==")) {
    text = text.slice(2, -2);
  }

  return `<mark class="${colorClass}">${text}</mark>`;
}

export function wrapWithMark(text: string, colorClass: string): string {
  let fence: { character: string; length: number } | null = null;

  return text.split("\n").map((line) => {
    if (!line) return line;
    const quote = line.match(/^((?: {0,3}>[ \t]*)+)/)?.[1] ?? "";
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
    if (fence) return line;

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
    const blockPrefix = heading?.[1] ?? list?.[1] ?? "";
    prefix += blockPrefix;
    content = content.slice(blockPrefix.length);

    // Wrapping a whole table row or thematic break would stop it rendering as
    // a Markdown block. Leave those structural lines untouched.
    if (/^\|.*\|[ \t]*$/.test(content) || /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/.test(content)) {
      return line;
    }
    if (!content) return line;
    return `${prefix}${wrapInline(content, colorClass)}`;
  }).join("\n");
}

export function applyColorToText(
  text: string,
  newClass: string,
  kind: HighlightKind
): string {
  const whole = text.match(/^<mark\s+class="([^"]*)">([\s\S]*)<\/mark>$/);
  if (whole && hasPluginClass(whole[1])) {
    const classes = whole[1]
      .split(/\s+/)
      .filter(Boolean)
      .filter((className) => {
        if (kind === "bg") return !className.startsWith("hl-");
        return !className.startsWith("hlt-");
      });
    classes.push(newClass);
    return `<mark class="${classes.join(" ")}">${removeHighlightsFromText(whole[2])}</mark>`;
  }

  return wrapWithMark(removeHighlightsFromText(text), newClass);
}

function outerPluginMarks(documentText: string): PluginMark[] {
  const marks = parsePluginMarks(documentText);
  return marks.filter(
    (mark) => !marks.some(
      (other) => other !== mark &&
        other.from <= mark.from &&
        other.to >= mark.to
    )
  );
}

function overlapsSelectedContent(
  mark: PluginMark,
  selection: SelectionInfo
): boolean {
  return Math.max(mark.innerFrom, selection.from) <
    Math.min(mark.innerTo, selection.to);
}

function mergeAdjacentPluginMarks(text: string): string {
  const adjacent = /<mark class="([^"]+)">((?:(?!<\/mark>)[\s\S])*)<\/mark><mark class="\1">((?:(?!<\/mark>)[\s\S])*)<\/mark>/g;
  let previous: string;
  do {
    previous = text;
    text = text.replace(adjacent, '<mark class="$1">$2$3</mark>');
  } while (text !== previous);
  return text;
}

interface StyledChunk {
  from: number;
  to: number;
  classNames: string[];
}

interface PluginMarkEvent {
  from: number;
  to: number;
  type: "open" | "close";
  mark: PluginMark;
}

function effectivePluginClasses(stack: PluginMark[]): string[] {
  const classes: string[] = [];

  for (const mark of stack) {
    for (const className of mark.classNames.split(/\s+/).filter(Boolean)) {
      if (className.startsWith("hlt-")) {
        for (let index = classes.length - 1; index >= 0; index -= 1) {
          if (classes[index].startsWith("hlt-")) classes.splice(index, 1);
        }
      } else if (className.startsWith("hl-")) {
        for (let index = classes.length - 1; index >= 0; index -= 1) {
          if (classes[index].startsWith("hl-")) classes.splice(index, 1);
        }
      } else if (classes.includes(className)) {
        continue;
      }
      classes.push(className);
    }
  }

  return classes;
}

/** Walk visible source chunks while treating nested plugin marks as a style
 * stack. Plugin tags themselves are omitted, so rebuilding a changed range
 * also normalises legacy nested marks into valid, non-overlapping wrappers. */
function styledChunks(
  documentText: string,
  from: number,
  to: number
): StyledChunk[] {
  const marks = parsePluginMarks(documentText)
    .filter((mark) => mark.from >= from && mark.to <= to);
  const events: PluginMarkEvent[] = [];
  for (const mark of marks) {
    events.push(
      { from: mark.from, to: mark.innerFrom, type: "open", mark },
      { from: mark.innerTo, to: mark.to, type: "close", mark }
    );
  }
  events.sort((a, b) =>
    a.from - b.from || (a.type === "close" ? -1 : 1)
  );

  const chunks: StyledChunk[] = [];
  const stack: PluginMark[] = [];
  let cursor = from;

  for (const event of events) {
    if (event.from > cursor) {
      chunks.push({
        from: cursor,
        to: event.from,
        classNames: effectivePluginClasses(stack),
      });
    }

    if (event.type === "open") {
      stack.push(event.mark);
    } else {
      const index = stack.lastIndexOf(event.mark);
      if (index >= 0) stack.splice(index, 1);
    }
    cursor = Math.max(cursor, event.to);
  }

  if (cursor < to) {
    chunks.push({
      from: cursor,
      to,
      classNames: effectivePluginClasses(stack),
    });
  }

  return chunks;
}

function editSelectionAcrossMarks(
  documentText: string,
  selection: SelectionInfo,
  transform: (text: string, classNames: string | null) => string
): TextEdit {
  const marks = outerPluginMarks(documentText)
    .filter((mark) => overlapsSelectedContent(mark, selection));

  if (marks.length === 0) {
    return {
      from: selection.from,
      to: selection.to,
      insert: transform(selection.text, null),
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
    const wrapOriginal = (from: number, to: number) => {
      if (to <= from) return "";
      const value = documentText.slice(from, to);
      return chunk.classNames.length > 0
        ? wrapWithClasses(value, chunk.classNames)
        : value;
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

function replaceColorClass(
  classNames: string,
  kind: HighlightKind,
  newClass: string | null
): string[] {
  const classes = classNames
    .split(/\s+/)
    .filter(Boolean)
    .filter((className) =>
      kind === "bg"
        ? !className.startsWith("hl-")
        : !className.startsWith("hlt-")
    );
  if (newClass) classes.push(newClass);
  return classes;
}

function wrapWithClasses(text: string, classes: string[]): string {
  const cleaned = removeHighlightsFromText(text);
  return classes.length > 0
    ? `<mark class="${classes.join(" ")}">${cleaned}</mark>`
    : cleaned;
}

function splitNativeHighlight(
  documentText: string,
  highlight: NativeHighlight,
  selection: SelectionInfo
): string {
  const inner = documentText.slice(highlight.innerFrom, highlight.innerTo);
  const wrapper = INLINE_WRAPPERS.find((candidate) =>
    inner.length > candidate.length * 2 &&
    inner.startsWith(candidate) &&
    inner.endsWith(candidate)
  ) ?? "";
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
    wrapper,
  ].join("");
}

/** Remove native ==highlight== delimiters from only the selected content.
 * A surrounding emphasis wrapper is moved outside the split so partial edits
 * keep valid Markdown (for example **==left==middle==right==**). */
function removeNativeHighlightFromSelection(
  documentText: string,
  selection: SelectionInfo
): TextEdit | null {
  const highlights = parseNativeHighlights(documentText).filter(
    (highlight) => Math.max(highlight.innerFrom, selection.from) <
      Math.min(highlight.innerTo, selection.to)
  );
  if (highlights.length === 0) return null;

  const editFrom = Math.min(selection.from, ...highlights.map((mark) => mark.from));
  const editTo = Math.max(selection.to, ...highlights.map((mark) => mark.to));
  let insert = documentText.slice(editFrom, editTo);

  for (const highlight of [...highlights].sort((a, b) => b.from - a.from)) {
    const relativeFrom = highlight.from - editFrom;
    const relativeTo = highlight.to - editFrom;
    insert = insert.slice(0, relativeFrom) +
      splitNativeHighlight(documentText, highlight, selection) +
      insert.slice(relativeTo);
  }

  return { from: editFrom, to: editTo, insert };
}

/** Recolour only the selected source characters. Existing highlight wrappers
 * remain around the unselected sides, while the selected segment keeps the
 * other colour kind (background or text) and replaces only the requested one. */
export function applyColorToSelection(
  documentText: string,
  selection: SelectionInfo,
  newClass: string,
  kind: HighlightKind
): TextEdit {
  return editSelectionAcrossMarks(
    documentText,
    selection,
    (text, classNames) => classNames === null
      ? applyColorToText(text, newClass, kind)
      : wrapWithClasses(text, replaceColorClass(classNames, kind, newClass))
  );
}

export function removeColorFromSelection(
  documentText: string,
  selection: SelectionInfo,
  kind: HighlightKind
): TextEdit {
  if (kind === "bg") {
    const nativeEdit = removeNativeHighlightFromSelection(
      documentText,
      selection
    );
    if (nativeEdit) return nativeEdit;
  }

  return editSelectionAcrossMarks(
    documentText,
    selection,
    (text, classNames) => classNames === null
      ? removeHighlightsFromText(text)
      : wrapWithClasses(text, replaceColorClass(classNames, kind, null))
  );
}

export function removeHighlightsFromText(text: string): string {
  const hiddenRanges = pluginTagRanges(text);
  if (hiddenRanges.length === 0) return text;

  let result = "";
  let cursor = 0;
  for (const hidden of hiddenRanges) {
    if (hidden.from < cursor) continue;
    result += text.slice(cursor, hidden.from);
    cursor = hidden.to;
  }
  return result + text.slice(cursor);
}

/** Remove plugin styling only from the selected source characters. If the
 * selection overlaps one highlight, preserve wrappers around both unselected
 * sides. A full-wrapper selection is completely unwrapped. */
export function removeHighlightFromSelection(
  documentText: string,
  selection: SelectionInfo
): TextEdit {
  const nativeEdit = removeNativeHighlightFromSelection(
    documentText,
    selection
  );
  if (nativeEdit) return nativeEdit;

  return editSelectionAcrossMarks(
    documentText,
    selection,
    (text, classNames) => {
      if (classNames === null) return removeHighlightsFromText(text);
      const remaining = classNames
        .split(/\s+/)
        .filter(Boolean)
        .filter((className) => !PLUGIN_CLASS.test(className));
      return wrapWithClasses(text, remaining);
    }
  );
}

function uniformColor(values: Array<string | null>): string | null {
  if (values.length === 0 || values[0] === null) return null;
  return values.every((value) => value === values[0]) ? values[0] : null;
}

export function getSelectionColorState(
  documentText: string,
  selection: SelectionInfo
): SelectionColorState {
  const marks = outerPluginMarks(documentText)
    .filter((mark) => overlapsSelectedContent(mark, selection));
  const backgrounds: Array<string | null> = [];
  const textColors: Array<string | null> = [];
  const rangeFrom = marks.length > 0
    ? Math.min(selection.from, ...marks.map((mark) => mark.from))
    : selection.from;
  const rangeTo = marks.length > 0
    ? Math.max(selection.to, ...marks.map((mark) => mark.to))
    : selection.to;

  for (const chunk of styledChunks(documentText, rangeFrom, rangeTo)) {
    if (
      Math.max(chunk.from, selection.from) >=
      Math.min(chunk.to, selection.to)
    ) continue;
    const classes = chunk.classNames;
    backgrounds.push(classes.find((name) => name.startsWith("hl-")) ?? null);
    textColors.push(classes.find((name) => name.startsWith("hlt-")) ?? null);
  }

  return {
    bg: uniformColor(backgrounds),
    text: uniformColor(textColors),
  };
}

interface SourceRange {
  from: number;
  to: number;
}

function protectedMarkdownRanges(documentText: string): SourceRange[] {
  const ranges: SourceRange[] = [];
  const addMatches = (pattern: RegExp) => {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(documentText)) !== null) {
      ranges.push({ from: match.index, to: match.index + match[0].length });
      if (match[0].length === 0) pattern.lastIndex += 1;
    }
  };

  const frontmatter = documentText.match(
    /^(?:\uFEFF)?---[ \t]*\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/
  );
  if (frontmatter) ranges.push({ from: 0, to: frontmatter[0].length });

  let fence: { from: number; character: string; length: number } | null = null;
  const linePattern = /.*(?:\n|$)/g;
  let line: RegExpExecArray | null;
  while ((line = linePattern.exec(documentText)) !== null && line[0]) {
    const content = line[0].replace(/\r?\n$/, "");
    const marker = content.match(/^ {0,3}(`{3,}|~{3,})/)?.[1];
    if (!fence && marker) {
      fence = { from: line.index, character: marker[0], length: marker.length };
    } else if (
      fence &&
      new RegExp(`^ {0,3}${fence.character}{${fence.length},}[ \\t]*$`).test(content)
    ) {
      ranges.push({ from: fence.from, to: line.index + line[0].length });
      fence = null;
    }
  }
  if (fence) ranges.push({ from: fence.from, to: documentText.length });

  addMatches(/!?\[\[[\s\S]*?\]\]/g);
  addMatches(/(`+)([\s\S]*?)\1/g);
  addMatches(/\$\$[\s\S]*?\$\$/g);

  for (let index = 0; index < documentText.length; index += 1) {
    if (
      documentText[index] !== "$" ||
      documentText[index - 1] === "\\" ||
      documentText[index + 1] === "$"
    ) continue;
    for (let end = index + 1; end < documentText.length; end += 1) {
      if (documentText[end] === "\n") break;
      if (
        documentText[end] === "$" &&
        documentText[end - 1] !== "\\" &&
        documentText[end + 1] !== "$"
      ) {
        ranges.push({ from: index, to: end + 1 });
        index = end;
        break;
      }
    }
  }

  return ranges;
}

export function selectionOverlapsProtectedMarkdown(
  documentText: string,
  selection: SelectionInfo
): boolean {
  return protectedMarkdownRanges(documentText).some(
    (range) => selection.from < range.to && selection.to > range.from
  );
}
