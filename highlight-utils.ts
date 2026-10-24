export type HighlightKind = "bg" | "text";

export interface SelectionInfo {
  text: string;
  from: number;
  to: number;
}

const PLUGIN_CLASS = /^(?:hl|hlt)-[\w-]+$/;
const MARK_PATTERN = /<mark\s+class="([^"]*)">([\s\S]*?)<\/mark>/g;

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

  for (const candidate of calloutCandidates(selectedText)) {
    let index = documentText.indexOf(candidate);
    while (index >= 0) {
      const end = index + candidate.length;
      const distance = end < rangeStart
        ? rangeStart - end
        : index > rangeEnd
          ? index - rangeEnd
          : 0;

      if (distance < bestDistance) {
        best = { text: candidate, from: index, to: end };
        bestDistance = distance;
      }

      index = documentText.indexOf(candidate, index + 1);
    }
  }

  return best;
}

function hasPluginClass(classNames: string): boolean {
  return classNames.split(/\s+/).some((name) => PLUGIN_CLASS.test(name));
}

function visibleText(html: string): string {
  return html.replace(/<[^>]+>/g, "");
}

/** If the user selected all visible contents of an existing highlight, include
 * its source wrapper so recolouring replaces the class rather than nesting tags. */
export function expandToPluginMark(
  documentText: string,
  selection: SelectionInfo
): SelectionInfo {
  const before = documentText.slice(0, selection.from);
  const openStart = before.lastIndexOf("<mark");
  if (openStart < 0) return selection;

  const openEnd = documentText.indexOf(">", openStart);
  if (openEnd < 0 || openEnd >= selection.from) return selection;

  const openingTag = documentText.slice(openStart, openEnd + 1);
  const classMatch = openingTag.match(/^<mark\s+class="([^"]*)">$/);
  if (!classMatch || !hasPluginClass(classMatch[1])) return selection;

  const nestedOpen = documentText.indexOf("<mark", openEnd + 1);
  const closeStart = documentText.indexOf("</mark>", openEnd + 1);
  if (closeStart < selection.to || (nestedOpen >= 0 && nestedOpen < closeStart)) {
    return selection;
  }

  const inner = documentText.slice(openEnd + 1, closeStart);
  if (visibleText(inner) !== selection.text) return selection;

  const to = closeStart + "</mark>".length;
  return {
    text: documentText.slice(openStart, to),
    from: openStart,
    to,
  };
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
  return text.split("\n").map((line) => {
    if (!line) return line;
    const callout = line.match(/^((?:>\s*)+)([\s\S]*)$/);
    if (!callout) return wrapInline(line, colorClass);
    if (!callout[2]) return line;
    return `${callout[1]}${wrapInline(callout[2], colorClass)}`;
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
    return `<mark class="${classes.join(" ")}">${whole[2]}</mark>`;
  }

  return wrapWithMark(removeHighlightsFromText(text), newClass);
}

export function removeHighlightsFromText(text: string): string {
  return text.replace(MARK_PATTERN, (match, classNames: string, inner: string) => {
    return hasPluginClass(classNames) ? inner : match;
  });
}
