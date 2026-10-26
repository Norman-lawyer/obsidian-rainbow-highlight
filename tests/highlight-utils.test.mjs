import assert from "node:assert/strict";
import test from "node:test";

import {
  applyColorToText,
  expandToPluginMark,
  findClosestSelection,
  findPluginMarkAtOffset,
  removeHighlightsFromText,
  wrapWithMark,
} from "../highlight-utils.ts";

test("uses the selected occurrence when text is repeated", () => {
  const documentText = "same sentence\n\n> same sentence";
  const result = findClosestSelection(documentText, "same sentence", 18);
  assert.deepEqual(result, { text: "same sentence", from: 17, to: 30 });
});

test("maps multiline callout text back to prefixed Markdown source", () => {
  const documentText = "> [!note]\n> first line\n> second line";
  const result = findClosestSelection(documentText, "first line\nsecond line", 12);
  assert.deepEqual(result, {
    text: "first line\n> second line",
    from: 12,
    to: 36,
  });
});

test("keeps Markdown formatting instead of converting it to HTML", () => {
  assert.equal(
    wrapWithMark("**bold**", "hl-red"),
    '**<mark class="hl-red">bold</mark>**'
  );
  assert.equal(
    wrapWithMark("~~deleted~~", "hl-blue"),
    '~~<mark class="hl-blue">deleted</mark>~~'
  );
});

test("wraps callout lines separately and preserves prefixes", () => {
  assert.equal(
    wrapWithMark("first\n> second", "hl-green"),
    '<mark class="hl-green">first</mark>\n> <mark class="hl-green">second</mark>'
  );
});

test("changes one colour kind without losing the other", () => {
  assert.equal(
    applyColorToText(
      '<mark class="hl-red hlt-blue">hello</mark>',
      "hl-green",
      "bg"
    ),
    '<mark class="hlt-blue hl-green">hello</mark>'
  );
});

test("expands a rendered selection to an existing plugin mark", () => {
  const documentText = 'before <mark class="hl-red"><b>hello</b></mark> after';
  const from = documentText.indexOf("hello");
  const expanded = expandToPluginMark(documentText, {
    text: "hello",
    from,
    to: from + 5,
  });
  assert.equal(expanded.text, '<mark class="hl-red"><b>hello</b></mark>');
});

test("removes combined plugin highlights without touching unrelated marks", () => {
  assert.equal(
    removeHighlightsFromText(
      '<mark class="hl-red hlt-blue">hello</mark> <mark>native</mark>'
    ),
    "hello <mark>native</mark>"
  );
});

test("expands a partial selection to the containing highlight", () => {
  const documentText = '<mark class="hl-red">hello world</mark>';
  const from = documentText.indexOf("world");
  const expanded = expandToPluginMark(documentText, {
    text: "world",
    from,
    to: from + 5,
  });

  assert.deepEqual(expanded, {
    text: documentText,
    from: 0,
    to: documentText.length,
  });
});

test("finds the highlight containing a collapsed cursor", () => {
  const documentText = 'before <mark class="hl-green">hello</mark> after';
  const mark = findPluginMarkAtOffset(
    documentText,
    documentText.indexOf("hello") + 2
  );

  assert.deepEqual(mark, {
    text: '<mark class="hl-green">hello</mark>',
    from: 7,
    to: 42,
  });
});

test("removes all nested plugin marks in one action", () => {
  assert.equal(
    removeHighlightsFromText(
      '<mark class="hl-red">hello <mark class="hl-blue">world</mark></mark>'
    ),
    "hello world"
  );
});

test("maps rendered multiline text across existing mark tags", () => {
  const documentText =
    '<mark class="hl-red">first</mark>\n> <mark class="hl-red">second</mark>';
  const result = findClosestSelection(
    documentText,
    "first\nsecond",
    documentText.indexOf("second")
  );

  assert.deepEqual(result, {
    text: documentText,
    from: 0,
    to: documentText.length,
  });
});

test("expands a rendered partial selection ending at a highlight boundary", () => {
  const documentText = '<mark class="hl-red">hello world</mark>';
  const mapped = findClosestSelection(
    documentText,
    "world",
    documentText.indexOf("world")
  );

  assert.ok(mapped);
  assert.deepEqual(expandToPluginMark(documentText, mapped), {
    text: documentText,
    from: 0,
    to: documentText.length,
  });
});

test("preserves task lists, headings, and callout lists", () => {
  assert.equal(
    wrapWithMark("- [ ] first task\n- second item", "hl-yellow"),
    '- [ ] <mark class="hl-yellow">first task</mark>\n- <mark class="hl-yellow">second item</mark>'
  );
  assert.equal(
    wrapWithMark("## Heading\nparagraph", "hl-blue"),
    '## <mark class="hl-blue">Heading</mark>\n<mark class="hl-blue">paragraph</mark>'
  );
  assert.equal(
    wrapWithMark("> - [ ] first task", "hl-green"),
    '> - [ ] <mark class="hl-green">first task</mark>'
  );
});
