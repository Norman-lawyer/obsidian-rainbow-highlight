import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_SETTINGS,
  HIGHLIGHT_COLORS,
  getEnabledHighlightColors,
  normalizeSettings,
} from "../palette.ts";

test("normalizes persisted palette settings safely", () => {
  assert.deepEqual(
    normalizeSettings({
      enabledColorIds: ["red", "red", "unknown", "blue"],
      autoOpenPalette: false,
      popupDelay: 999,
      hasSeenWelcome: true,
    }),
    {
      enabledColorIds: ["red", "blue"],
      autoOpenPalette: false,
      popupDelay: 200,
      hasSeenWelcome: true,
    }
  );
});

test("restores all colours when saved settings would hide every colour", () => {
  assert.deepEqual(
    normalizeSettings({ enabledColorIds: [] }).enabledColorIds,
    DEFAULT_SETTINGS.enabledColorIds
  );
});

test("returns enabled colours in the product-defined palette order", () => {
  const settings = normalizeSettings({
    enabledColorIds: ["purple", "red", "cyan"],
  });

  assert.deepEqual(
    getEnabledHighlightColors(settings).map((color) => color.id),
    ["red", "cyan", "purple"]
  );
  assert.equal(HIGHLIGHT_COLORS.length, 7);
});
