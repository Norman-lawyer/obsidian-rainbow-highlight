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

export interface SizeLike {
  width: number;
  height: number;
}

export interface PointLike {
  top: number;
  left: number;
}

export interface SourceSelection {
  text: string;
  from: number;
  to: number;
}

export type PaletteRemoveAction = "all" | "text";

/** Keep a permanent remove control on both palette rows. The background row
 * retains the original clear-all action, while the text row removes only text
 * colour so mixed selections can still be cleaned up. */
export function getPaletteRemoveAction(
  kind: "bg" | "text"
): PaletteRemoveAction {
  return kind === "bg" ? "all" : "text";
}

export function getPaletteRemoveIcon(
  action: PaletteRemoveAction
): "eraser" | "remove-formatting" {
  return action === "all" ? "eraser" : "remove-formatting";
}

/** Clicking a palette control must not be treated as a new note selection. */
export function shouldQueueSelectionAfterPointerUp(
  popover: SelectionPopoverLike | null,
  target: Node | null
): boolean {
  return !popover || !popover.contains(target);
}

/** A cancelled pointer sequence can still leave a valid browser selection.
 * Always inspect it once the gesture has ended instead of dropping the final
 * selectionchange event that occurred while the pointer was held down. */
export function shouldQueueSelectionAfterPointerCancel(
  pointerWasDown: boolean
): boolean {
  return pointerWasDown;
}

/** A detached DOM range reports an all-zero rectangle and would place the
 * palette at the top-left corner. */
export function hasUsableSelectionRect(rect: SelectionRectLike): boolean {
  return [rect.top, rect.right, rect.bottom, rect.left, rect.width, rect.height]
    .every(Number.isFinite) && (rect.width > 0 || rect.height > 0);
}

/** Position the palette near the selection while keeping it fully inside the
 * viewport, even when neither side of a tall selection has enough room. */
export function positionSelectionPopover(
  rect: SelectionRectLike,
  popover: SizeLike,
  viewport: SizeLike,
  padding = 8
): PointLike {
  const preferredTop = rect.top - popover.height - padding >= padding
    ? rect.top - popover.height - padding
    : rect.bottom + padding;
  const maxTop = Math.max(padding, viewport.height - popover.height - padding);
  const preferredLeft = rect.left + rect.width / 2 - popover.width / 2;
  const maxLeft = Math.max(padding, viewport.width - popover.width - padding);
  return {
    top: Math.max(padding, Math.min(preferredTop, maxTop)),
    left: Math.max(padding, Math.min(preferredLeft, maxLeft)),
  };
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
