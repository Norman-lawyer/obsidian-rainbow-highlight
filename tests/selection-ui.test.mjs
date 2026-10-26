import assert from "node:assert/strict";
import test from "node:test";

import {
  getPaletteRemoveIcon,
  getPaletteRemoveAction,
  hasUsableSelectionRect,
  positionSelectionPopover,
  replaceExactSourceRange,
  shouldQueueSelectionAfterPointerCancel,
  shouldQueueSelectionAfterPointerUp,
} from "../selection-ui.ts";

test("uses distinct icons for clearing all highlighting and text colour", () => {
  assert.equal(getPaletteRemoveIcon("all"), "eraser");
  assert.equal(getPaletteRemoveIcon("text"), "remove-formatting");
});

test("gives each palette row the correct persistent remove action", () => {
  assert.equal(getPaletteRemoveAction("bg"), "all");
  assert.equal(getPaletteRemoveAction("text"), "text");
});

test("does not re-queue selection when a palette control is clicked", () => {
  const paletteButton = {};
  const note = {};
  const popover = {
    contains(target) {
      return target === paletteButton;
    },
  };

  assert.equal(
    shouldQueueSelectionAfterPointerUp(popover, paletteButton),
    false
  );
  assert.equal(shouldQueueSelectionAfterPointerUp(popover, note), true);
  assert.equal(shouldQueueSelectionAfterPointerUp(null, note), true);
});

test("re-checks the final selection when a pointer gesture is cancelled", () => {
  assert.equal(shouldQueueSelectionAfterPointerCancel(true), true);
  assert.equal(shouldQueueSelectionAfterPointerCancel(false), false);
});

test("rejects stale zero-sized selection rectangles", () => {
  assert.equal(
    hasUsableSelectionRect({ top: 0, right: 0, bottom: 0, left: 0, width: 0, height: 0 }),
    false
  );
  assert.equal(
    hasUsableSelectionRect({ top: 120, right: 260, bottom: 140, left: 180, width: 80, height: 20 }),
    true
  );
});

test("replaces the exact source range used by a reading-view selection", () => {
  const source = 'before <mark class="hl-yellow">hello</mark> after';
  const text = '<mark class="hl-yellow">hello</mark>';
  const from = source.indexOf(text);

  assert.equal(
    replaceExactSourceRange(source, { text, from, to: from + text.length }, "hello"),
    "before hello after"
  );
  assert.equal(
    replaceExactSourceRange(source, { text: "stale", from, to: from + text.length }, "hello"),
    null
  );
});

test("keeps the palette inside a short viewport", () => {
  assert.deepEqual(
    positionSelectionPopover(
      { top: 20, right: 180, bottom: 190, left: 20, width: 160, height: 170 },
      { width: 220, height: 96 },
      { width: 320, height: 240 }
    ),
    { top: 136, left: 8 }
  );
});
