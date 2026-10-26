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

const PLUGIN_CLASS = /^(?:hl|hlt)-[\w-]+$/;

interface PluginMark extends SelectionInfo {
  classNames: string;
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

function pluginTagRanges(documentText: string): HiddenRange[] {
  return parsePluginMarks(documentText)
    .flatMap((mark): HiddenRange[] => [
      { from: mark.from, to: mark.innerFrom, kind: "open" },
      { from: mark.innerTo, to: mark.to, kind: "close" },
    ])
    .sort((a, b) => a.from - b.from || a.to - b.to);
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
  const wrappers = ["***", "___", "**", "__", "~~", "*", "_"];
  for (const wrapper of wrappers) {
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

/** Recolour only the selected source characters. Existing highlight wrappers
 * remain around the unselected sides, while the selected segment keeps the
 * other colour kind (background or text) and replaces only the requested one. */
export function applyColorToSelection(
  documentText: string,
  selection: SelectionInfo,
  newClass: string,
  kind: HighlightKind
): TextEdit {
  const containingMark = parsePluginMarks(documentText)
    .filter(
      (mark) =>
        selection.from >= mark.from &&
        selection.to <= mark.to &&
        selection.to >= mark.innerFrom &&
        selection.from <= mark.innerTo
    )
    .sort((a, b) => (a.to - a.from) - (b.to - b.from))[0];

  if (!containingMark) {
    return {
      from: selection.from,
      to: selection.to,
      insert: applyColorToText(selection.text, newClass, kind),
    };
  }

  const openingTag = documentText.slice(
    containingMark.from,
    containingMark.innerFrom
  );
  const closingTag = documentText.slice(
    containingMark.innerTo,
    containingMark.to
  );
  const selectedFrom = Math.max(selection.from, containingMark.innerFrom);
  const selectedTo = Math.min(selection.to, containingMark.innerTo);
  const before = documentText.slice(containingMark.innerFrom, selectedFrom);
  const selected = documentText.slice(selectedFrom, selectedTo);
  const after = documentText.slice(selectedTo, containingMark.innerTo);
  const wrapOriginal = (text: string) =>
    text ? openingTag + text + closingTag : "";
  const recoloured = selected
    ? applyColorToText(openingTag + selected + closingTag, newClass, kind)
    : "";

  return {
    from: containingMark.from,
    to: containingMark.to,
    insert: wrapOriginal(before) + recoloured + wrapOriginal(after),
  };
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
  const containingMark = parsePluginMarks(documentText)
    .filter(
      (mark) =>
        selection.from >= mark.from &&
        selection.to <= mark.to &&
        selection.to >= mark.innerFrom &&
        selection.from <= mark.innerTo
    )
    .sort((a, b) => (a.to - a.from) - (b.to - b.from))[0];

  if (!containingMark) {
    return {
      from: selection.from,
      to: selection.to,
      insert: removeHighlightsFromText(selection.text),
    };
  }

  const openingTag = documentText.slice(
    containingMark.from,
    containingMark.innerFrom
  );
  const closingTag = documentText.slice(
    containingMark.innerTo,
    containingMark.to
  );
  const selectedFrom = Math.max(selection.from, containingMark.innerFrom);
  const selectedTo = Math.min(selection.to, containingMark.innerTo);
  const before = documentText.slice(containingMark.innerFrom, selectedFrom);
  const selected = documentText.slice(selectedFrom, selectedTo);
  const after = documentText.slice(selectedTo, containingMark.innerTo);
  const wrap = (text: string) => text ? openingTag + text + closingTag : "";

  return {
    from: containingMark.from,
    to: containingMark.to,
    insert:
      wrap(before) + removeHighlightsFromText(selected) + wrap(after),
  };
}
