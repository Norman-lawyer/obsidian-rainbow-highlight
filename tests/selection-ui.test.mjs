import assert from "node:assert/strict";
import test from "node:test";

import {
  hasUsableSelectionRect,
  replaceExactSourceRange,
  shouldQueueSelectionAfterPointerUp,
} from "../selection-ui.ts";

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
