import assert from "node:assert/strict";
import test from "node:test";

import {
  applyColorToSelection,
  applyColorToText,
  expandToPluginMark,
  findClosestSelection,
  findPluginMarkAtOffset,
  getSelectionColorState,
  removeHighlightFromSelection,
  removeColorFromSelection,
  removeHighlightsFromText,
  selectionOverlapsProtectedMarkdown,
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

test("recolours an entire existing highlight", () => {
  const documentText = '<mark class="hl-red">hello</mark>';

  assert.deepEqual(
    applyColorToSelection(
      documentText,
      { text: documentText, from: 0, to: documentText.length },
      "hl-blue",
      "bg"
    ),
    {
      from: 0,
      to: documentText.length,
      insert: '<mark class="hl-blue">hello</mark>',
    }
  );
});

test("recolours only the selected part of an existing highlight", () => {
  const documentText = '<mark class="hl-red">abcdef</mark>';
  const from = documentText.indexOf("cd");

  assert.deepEqual(
    applyColorToSelection(
      documentText,
      { text: "cd", from, to: from + 2 },
      "hl-blue",
      "bg"
    ),
    {
      from: 0,
      to: documentText.length,
      insert:
        '<mark class="hl-red">ab</mark>' +
        '<mark class="hl-blue">cd</mark>' +
        '<mark class="hl-red">ef</mark>',
    }
  );
});

test("preserves text colour while recolouring selected background", () => {
  const documentText = '<mark class="hl-red hlt-yellow">abcdef</mark>';
  const innerFrom = documentText.indexOf("abcdef");

  assert.equal(
    applyColorToSelection(
      documentText,
      {
        text: documentText.slice(0, innerFrom + 2),
        from: 0,
        to: innerFrom + 2,
      },
      "hl-blue",
      "bg"
    ).insert,
    '<mark class="hlt-yellow hl-blue">ab</mark>' +
      '<mark class="hl-red hlt-yellow">cdef</mark>'
  );
});

test("recolours safely across partial boundaries of multiple highlights", () => {
  const documentText =
    '<mark class="hl-red">AB</mark> middle <mark class="hl-green">CD</mark>';
  const selection = findClosestSelection(
    documentText,
    "B middle C",
    documentText.indexOf("middle")
  );

  assert.ok(selection);
  assert.deepEqual(
    applyColorToSelection(documentText, selection, "hl-blue", "bg"),
    {
      from: 0,
      to: documentText.length,
      insert:
        '<mark class="hl-red">A</mark>' +
        '<mark class="hl-blue">B middle C</mark>' +
        '<mark class="hl-green">D</mark>',
    }
  );
});

test("removes safely across partial boundaries of multiple highlights", () => {
  const documentText =
    '<mark class="hl-red">AB</mark> middle <mark class="hl-green">CD</mark>';
  const selection = findClosestSelection(
    documentText,
    "B middle C",
    documentText.indexOf("middle")
  );

  assert.ok(selection);
  assert.deepEqual(removeHighlightFromSelection(documentText, selection), {
    from: 0,
    to: documentText.length,
    insert:
      '<mark class="hl-red">A</mark>B middle C' +
      '<mark class="hl-green">D</mark>',
  });
});

test("does not fragment markup when the selected colour is unchanged", () => {
  const documentText = '<mark class="hl-red">abcdef</mark>';
  const from = documentText.indexOf("cd");

  assert.equal(
    applyColorToSelection(
      documentText,
      { text: "cd", from, to: from + 2 },
      "hl-red",
      "bg"
    ).insert,
    documentText
  );
});

test("removes only one colour kind from the selected segment", () => {
  const documentText = '<mark class="hl-red hlt-blue">abcdef</mark>';
  const from = documentText.indexOf("cd");

  assert.equal(
    removeColorFromSelection(
      documentText,
      { text: "cd", from, to: from + 2 },
      "bg"
    ).insert,
    '<mark class="hl-red hlt-blue">ab</mark>' +
      '<mark class="hlt-blue">cd</mark>' +
      '<mark class="hl-red hlt-blue">ef</mark>'
  );
});

test("reports uniform active background and text colours", () => {
  const documentText = '<mark class="hl-red hlt-blue">abcdef</mark>';
  const from = documentText.indexOf("bc");

  assert.deepEqual(
    getSelectionColorState(documentText, {
      text: "bc",
      from,
      to: from + 2,
    }),
    { bg: "hl-red", text: "hlt-blue" }
  );
});

test("recolours a partial nested highlight without leaving broken tags", () => {
  const documentText =
    '<mark class="hl-red hlt-yellow">A' +
    '<mark class="hl-blue">BC</mark>D</mark>';
  const selection = findClosestSelection(
    documentText,
    "B",
    documentText.indexOf("B")
  );

  assert.ok(selection);
  assert.equal(
    applyColorToSelection(documentText, selection, "hl-green", "bg").insert,
    '<mark class="hl-red hlt-yellow">A</mark>' +
      '<mark class="hlt-yellow hl-green">B</mark>' +
      '<mark class="hlt-yellow hl-blue">C</mark>' +
      '<mark class="hl-red hlt-yellow">D</mark>'
  );
});

test("removes one colour channel from a partial nested highlight", () => {
  const documentText =
    '<mark class="hl-red hlt-yellow">A' +
    '<mark class="hl-blue">BC</mark>D</mark>';
  const selection = findClosestSelection(
    documentText,
    "B",
    documentText.indexOf("B")
  );

  assert.ok(selection);
  assert.equal(
    removeColorFromSelection(documentText, selection, "bg").insert,
    '<mark class="hl-red hlt-yellow">A</mark>' +
      '<mark class="hlt-yellow">B</mark>' +
      '<mark class="hlt-yellow hl-blue">C</mark>' +
      '<mark class="hl-red hlt-yellow">D</mark>'
  );
});

test("reports the effective inner colours of a nested highlight", () => {
  const documentText =
    '<mark class="hl-red hlt-yellow">A' +
    '<mark class="hl-blue">BC</mark>D</mark>';
  const selection = findClosestSelection(
    documentText,
    "B",
    documentText.indexOf("B")
  );

  assert.ok(selection);
  assert.deepEqual(getSelectionColorState(documentText, selection), {
    bg: "hl-blue",
    text: "hlt-yellow",
  });
});

test("blocks highlighting inside protected Markdown syntax", () => {
  const cases = [
    ["Before `code` after", "code"],
    ["```js\nconst value = 1;\n```", "value"],
    ["Math $E=mc^2$ end", "E=mc^2"],
    ["Link [[Page|Alias]] end", "Alias"],
    ["---\ntitle: Demo\n---\nBody", "Demo"],
  ];

  for (const [documentText, selectedText] of cases) {
    const from = documentText.indexOf(selectedText);
    assert.equal(
      selectionOverlapsProtectedMarkdown(documentText, {
        text: selectedText,
        from,
        to: from + selectedText.length,
      }),
      true,
      documentText
    );
  }

  const ordinary = "Price is $5 and ordinary text";
  const from = ordinary.indexOf("ordinary");
  assert.equal(
    selectionOverlapsProtectedMarkdown(ordinary, {
      text: "ordinary",
      from,
      to: from + "ordinary".length,
    }),
    false
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

test("removes highlighting only from the selected middle segment", () => {
  const documentText = '<mark class="hl-yellow">abcdef</mark>';
  const from = documentText.indexOf("cd");

  assert.deepEqual(
    removeHighlightFromSelection(documentText, {
      text: "cd",
      from,
      to: from + 2,
    }),
    {
      from: 0,
      to: documentText.length,
      insert:
        '<mark class="hl-yellow">ab</mark>cd<mark class="hl-yellow">ef</mark>',
    }
  );
});

test("does not leave empty wrappers when removing an edge segment", () => {
  const documentText = '<mark class="hl-yellow hlt-blue">abcdef</mark>';
  const start = documentText.indexOf("abcdef");

  assert.equal(
    removeHighlightFromSelection(documentText, {
      text: "ab",
      from: start,
      to: start + 2,
    }).insert,
    'ab<mark class="hl-yellow hlt-blue">cdef</mark>'
  );
  assert.equal(
    removeHighlightFromSelection(documentText, {
      text: "ef",
      from: start + 4,
      to: start + 6,
    }).insert,
    '<mark class="hl-yellow hlt-blue">abcd</mark>ef'
  );
});

test("handles rendered edge selections whose source range includes a hidden tag", () => {
  const documentText = '<mark class="hl-yellow">abcdef</mark>';
  const innerFrom = documentText.indexOf("abcdef");
  const innerTo = innerFrom + 6;

  assert.equal(
    removeHighlightFromSelection(documentText, {
      text: documentText.slice(0, innerFrom + 2),
      from: 0,
      to: innerFrom + 2,
    }).insert,
    'ab<mark class="hl-yellow">cdef</mark>'
  );
  assert.equal(
    removeHighlightFromSelection(documentText, {
      text: documentText.slice(innerTo - 2),
      from: innerTo - 2,
      to: documentText.length,
    }).insert,
    '<mark class="hl-yellow">abcd</mark>ef'
  );
});

test("removes the whole highlight when the full wrapper is targeted", () => {
  const documentText = '<mark class="hl-yellow">abcdef</mark>';

  assert.deepEqual(
    removeHighlightFromSelection(documentText, {
      text: documentText,
      from: 0,
      to: documentText.length,
    }),
    { from: 0, to: documentText.length, insert: "abcdef" }
  );
});

test("removes an Obsidian native highlight while preserving bold formatting", () => {
  const visibleText =
    "边际效用递减，即你拥有的越多，对你而言，每一样额外增加的物品的价值就会越低。";
  const documentText = `==**${visibleText}**==`;
  const selection = findClosestSelection(documentText, visibleText, 4);

  assert.ok(selection);
  assert.deepEqual(
    removeHighlightFromSelection(documentText, selection),
    { from: 0, to: documentText.length, insert: `**${visibleText}**` }
  );
});

test("removes only the selected part of a native bold highlight", () => {
  const documentText = "==**abcdef**==";
  const from = documentText.indexOf("cd");

  assert.deepEqual(
    removeHighlightFromSelection(documentText, {
      text: "cd",
      from,
      to: from + 2,
    }),
    {
      from: 0,
      to: documentText.length,
      insert: "**==ab==cd==ef==**",
    }
  );
});

test("the background eraser also removes Obsidian native highlighting", () => {
  const documentText = "before ==hello== after";
  const from = documentText.indexOf("hello");

  assert.deepEqual(
    removeColorFromSelection(
      documentText,
      { text: "hello", from, to: from + 5 },
      "bg"
    ),
    { from: 7, to: 16, insert: "hello" }
  );
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
