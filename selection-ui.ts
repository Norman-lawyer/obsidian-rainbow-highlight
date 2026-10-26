export interface SelectionPopoverLike {
  contains(target: Node | null): boolean;
}

export interface SelectionRectLike {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
}

export interface SourceSelection {
  text: string;
  from: number;
  to: number;
}

/** Clicking a palette control must not be treated as a new note selection. */
export function shouldQueueSelectionAfterPointerUp(
  popover: SelectionPopoverLike | null,
  target: Node | null
): boolean {
  return !popover || !popover.contains(target);
}

/** A detached DOM range reports an all-zero rectangle and would place the
 * palette at the top-left corner. */
export function hasUsableSelectionRect(rect: SelectionRectLike): boolean {
  return [rect.top, rect.right, rect.bottom, rect.left, rect.width, rect.height]
    .every(Number.isFinite) && (rect.width > 0 || rect.height > 0);
}

/** Apply a preview-mode edit only if the source still matches the selection
 * that was shown to the user. */
export function replaceExactSourceRange(
  source: string,
  selection: SourceSelection,
  replacement: string
): string | null {
  if (
    selection.from < 0 ||
    selection.to < selection.from ||
    selection.to > source.length ||
    source.slice(selection.from, selection.to) !== selection.text
  ) {
    return null;
  }
  return source.slice(0, selection.from) + replacement + source.slice(selection.to);
}
