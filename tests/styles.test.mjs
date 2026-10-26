import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");

test("mobile palette wraps controls into a four-column touch grid", () => {
  assert.match(
    css,
    /@media[^{}]*\(pointer: coarse\)[\s\S]*?\.hl-popover-row\s*\{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:\s*repeat\(4,\s*44px\);/
  );
});

test("mobile palette exposes a visible row label", () => {
  assert.match(
    css,
    /@media[^{}]*\(pointer: coarse\)[\s\S]*?\.hl-row-label-text\s*\{[\s\S]*?display:\s*inline;/
  );
});
