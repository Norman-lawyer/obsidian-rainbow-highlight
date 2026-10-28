import {
  Editor,
  MarkdownView,
  Notice,
  Plugin,
  setIcon,
} from "obsidian";
import {
  applyColorToSelection,
  applyColorToText,
  findClosestSelection,
  findPluginMarkAtOffset,
  getSelectionColorState,
  HighlightKind,
  removeColorFromSelection,
  removeHighlightFromSelection,
  removeHighlightsFromText,
  selectionOverlapsProtectedMarkdown,
  SelectionInfo,
} from "./highlight-utils";
import {
  getPaletteRemoveIcon,
  getPaletteRemoveAction,
  hasUsableSelectionRect,
  PaletteRemoveAction,
  positionSelectionPopover,
  replaceExactSourceRange,
  SelectionRectLike,
  shouldQueueSelectionAfterPointerCancel,
  shouldQueueSelectionAfterPointerUp,
} from "./selection-ui";
import {
  DEFAULT_SETTINGS,
  getEnabledHighlightColors,
  HIGHLIGHT_COLORS,
  HighlightColor,
  normalizeSettings,
  RainbowHighlightSettings,
} from "./palette";
import { RainbowHighlightSettingTab } from "./settings-tab";

interface CmEditorView {
  state: {
    selection: { main: { from: number; to: number } };
    doc: { toString(): string };
    sliceDoc(from: number, to: number): string;
  };
  dispatch(tr: { changes: { from: number; to: number; insert: string } }): void;
  posAtDOM?(node: Node, offset?: number): number;
  coordsAtPos?(pos: number): DOMRect | null;
}

interface EditorWithCm extends Editor {
  cm?: CmEditorView;
}

function getCmView(editor: Editor): CmEditorView | null {
  return (editor as EditorWithCm).cm ?? null;
}

function getDomSelection(
  editor: Editor,
  sourceText?: string
): SelectionInfo | null {
  const cmView = getCmView(editor);
  if (!cmView) return null;
  const domSelection = activeWindow.getSelection();
  if (!domSelection || domSelection.rangeCount === 0 || domSelection.isCollapsed) {
    return null;
  }
  const domText = domSelection.toString();
  if (!domText || !domText.trim()) return null;

  const editorSelection = cmView.state.selection.main;
  let hintFrom = editorSelection.from;
  let hintTo = editorSelection.to;
  const range = domSelection.getRangeAt(0);
  if (cmView.posAtDOM) {
    try {
      hintFrom = cmView.posAtDOM(range.startContainer, range.startOffset);
      hintTo = cmView.posAtDOM(range.endContainer, range.endOffset);
    } catch {
      // Reading-view nodes and some rendered widgets are outside CodeMirror.
    }
  }

  return findClosestSelection(
    sourceText ?? cmView.state.doc.toString(),
    domText,
    hintFrom,
    hintTo
  );
}

function getSelection(
  editor: Editor,
  preferDomSelection = false,
  sourceText?: string
): SelectionInfo | null {
  if (preferDomSelection) {
    const domSelection = getDomSelection(editor, sourceText);
    if (domSelection) return domSelection;
  }

  const text = editor.getSelection();
  if (text && text.trim().length > 0) {
    const cmView = getCmView(editor);
    if (cmView) {
      const selection = cmView.state.selection.main;
      return { text, from: selection.from, to: selection.to };
    }
    const from = editor.getCursor("from");
    const to = editor.getCursor("to");
    return { text, from: editor.posToOffset(from), to: editor.posToOffset(to) };
  }

  const cmView = getCmView(editor);
  if (!cmView) return null;
  const selection = cmView.state.selection.main;
  if (selection.from !== selection.to) {
    const cmText = cmView.state.sliceDoc(selection.from, selection.to);
    if (cmText && cmText.trim().length > 0) {
      return { text: cmText, from: selection.from, to: selection.to };
    }
  }

  // Rendered widgets such as callouts expose a DOM selection but not always a
  // CodeMirror selection. Use the nearest source occurrence, not the first one.
  return getDomSelection(editor);
}

export default class RainbowHighlightPlugin extends Plugin {
  settings: RainbowHighlightSettings = {
    ...DEFAULT_SETTINGS,
    enabledColorIds: [...DEFAULT_SETTINGS.enabledColorIds],
  };
  private popover: HTMLElement | null = null;
  private currentSelection: SelectionInfo | null = null;
  private selectionTimer: number | null = null;
  private ignoreSelectionUntil = 0;
  private pointerIsDown = false;

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new RainbowHighlightSettingTab(this.app, this));

    this.registerDomEvent(activeDocument, "pointerdown", () => {
      this.pointerIsDown = true;
    });

    this.registerDomEvent(activeDocument, "pointerup", (event: PointerEvent) => {
      this.pointerIsDown = false;
      if (
        shouldQueueSelectionAfterPointerUp(
          this.popover,
          event.target as Node | null
        )
      ) {
        this.queueSelection(this.settings.popupDelay);
      }
    });

    this.registerDomEvent(activeDocument, "pointercancel", () => {
      const pointerWasDown = this.pointerIsDown;
      this.pointerIsDown = false;
      if (shouldQueueSelectionAfterPointerCancel(pointerWasDown)) {
        this.queueSelection(this.settings.popupDelay);
      }
    });

    // Electron can occasionally finish a text drag with mouseup but without a
    // matching pointerup. Only use this as a fallback when the pointer flag is
    // still set, so normal gestures are not scheduled twice.
    this.registerDomEvent(activeDocument, "mouseup", (event: MouseEvent) => {
      if (!this.pointerIsDown) return;
      this.pointerIsDown = false;
      if (
        shouldQueueSelectionAfterPointerUp(
          this.popover,
          event.target as Node | null
        )
      ) {
        this.queueSelection(this.settings.popupDelay);
      }
    });

    this.registerDomEvent(activeDocument, "selectionchange", () => {
      if (!this.pointerIsDown) this.queueSelection(this.settings.popupDelay);
    });

    this.registerDomEvent(activeDocument, "keyup", (event: KeyboardEvent) => {
      if (event.shiftKey) this.queueSelection(this.settings.popupDelay);
    });

    this.registerDomEvent(activeDocument, "mousedown", (event: MouseEvent) => {
      if (this.popover && !this.popover.contains(event.target as Node)) {
        this.removePopover(true);
      }
    });

    this.registerDomEvent(
      activeDocument,
      "scroll",
      () => this.removePopover(true),
      true
    );
    this.registerDomEvent(activeWindow, "resize", () => this.removePopover(true));

    HIGHLIGHT_COLORS.forEach((color) => {
      this.addCommand({
        id: `highlight-${color.class}`,
        name: `Highlight background: ${color.name.toLowerCase()}`,
        editorCallback: (editor: Editor) => this.applyColor(editor, color, "bg"),
      });
      this.addCommand({
        id: `text-${color.class}`,
        name: `Text color: ${color.name.toLowerCase()}`,
        editorCallback: (editor: Editor) => this.applyColor(editor, color, "text"),
      });
    });

    this.addCommand({
      id: "show-color-palette",
      name: "Show color palette",
      editorCallback: (editor: Editor) => this.showPaletteFromCommand(editor),
    });
    this.addCommand({
      id: "remove-highlight",
      name: "Remove highlight",
      editorCallback: (editor: Editor) => this.removeHighlight(editor),
    });
    this.addCommand({
      id: "remove-background-color",
      name: "Remove background color",
      editorCallback: (editor: Editor) => this.removeColor(editor, "bg"),
    });
    this.addCommand({
      id: "remove-text-color",
      name: "Remove text color",
      editorCallback: (editor: Editor) => this.removeColor(editor, "text"),
    });

    this.app.workspace.onLayoutReady(() => {
      void this.showWelcomeOnce();
    });
  }

  onunload() {
    if (this.selectionTimer !== null) {
      window.clearTimeout(this.selectionTimer);
    }
    this.removePopover(true);
  }

  private queueSelection(delay: number) {
    if (this.selectionTimer !== null) {
      window.clearTimeout(this.selectionTimer);
    }
    this.selectionTimer = window.setTimeout(() => {
      this.selectionTimer = null;
      this.handleSelection();
    }, delay);
  }

  private handleSelection() {
    if (Date.now() < this.ignoreSelectionUntil) return;
    if (!this.settings.autoOpenPalette) {
      this.removePopover(true);
      return;
    }
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!activeView) {
      this.removePopover(true);
      return;
    }

    const domSelection = activeWindow.getSelection();
    const anchor = domSelection?.anchorNode;
    if (!anchor || !activeView.containerEl.contains(anchor)) {
      this.removePopover(true);
      return;
    }

    const editor = activeView.editor;
    const isPreview = activeView.getMode() === "preview";
    const sourceText = isPreview
      ? activeView.getViewData()
      : getCmView(editor)?.state.doc.toString();
    const selectionInfo = getSelection(
      editor,
      isPreview,
      sourceText
    );
    if (!selectionInfo || !domSelection || domSelection.rangeCount === 0) {
      this.removePopover(true);
      return;
    }
    if (
      sourceText &&
      selectionOverlapsProtectedMarkdown(sourceText, selectionInfo)
    ) {
      this.removePopover(true);
      return;
    }

    this.currentSelection = selectionInfo;
    const rect = domSelection.getRangeAt(0).getBoundingClientRect();
    if (!hasUsableSelectionRect(rect)) {
      this.removePopover(true);
      return;
    }
    this.showPopover(rect, editor);
  }

  private showPopover(rect: SelectionRectLike, editor: Editor) {
    this.removePopover(false);

    const popover = createDiv({ cls: "hl-popover" });
    popover.setAttribute("role", "toolbar");
    popover.setAttribute("aria-label", "Rainbow Highlight colors");
    popover.addEventListener("mousedown", (event) => {
      // Keep the note selection alive until the palette action uses it.
      event.preventDefault();
      event.stopPropagation();
    });
    popover.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        this.removePopover(true);
        return;
      }
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
        return;
      }
      const buttons = Array.from(
        popover.querySelectorAll<HTMLButtonElement>("button")
      );
      const current = buttons.indexOf(
        activeDocument.activeElement as HTMLButtonElement
      );
      if (current < 0) return;
      const step = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
      event.preventDefault();
      buttons[(current + step + buttons.length) % buttons.length]?.focus();
    });
    const container = createDiv({ cls: "hl-popover-colors" });

    const sourceText = this.getSourceText(editor);
    const colorState = sourceText && this.currentSelection
      ? getSelectionColorState(sourceText, this.currentSelection)
      : { bg: null, text: null };
    const backgroundRow = this.buildRow(
      editor,
      "bg",
      "Background",
      colorState.bg
    );
    backgroundRow.appendChild(
      this.buildRemoveButton(editor, getPaletteRemoveAction("bg"))
    );
    container.appendChild(backgroundRow);
    const textRow = this.buildRow(editor, "text", "Text", colorState.text);
    textRow.appendChild(
      this.buildRemoveButton(editor, getPaletteRemoveAction("text"))
    );
    container.appendChild(textRow);
    popover.appendChild(container);
    activeDocument.body.appendChild(popover);

    const popoverRect = popover.getBoundingClientRect();
    const position = positionSelectionPopover(
      rect,
      popoverRect,
      { width: activeWindow.innerWidth, height: activeWindow.innerHeight }
    );

    popover.setCssStyles({
      top: `${position.top}px`,
      left: `${position.left}px`,
    });
    this.popover = popover;
  }

  private buildRow(
    editor: Editor,
    kind: HighlightKind,
    labelText: string,
    activeClass: string | null
  ): HTMLElement {
    const row = createDiv({ cls: "hl-popover-row" });
    const label = createDiv({ cls: "hl-row-icon" });
    label.setAttribute("aria-label", labelText);
    label.setAttribute("title", labelText);
    setIcon(label, kind === "bg" ? "highlighter" : "type");
    const visibleLabel = createSpan({
      cls: "hl-row-label-text",
      text: labelText,
    });
    label.appendChild(visibleLabel);
    row.appendChild(label);

    getEnabledHighlightColors(this.settings).forEach((color) => {
      const circle = createEl("button", { cls: "hl-color-circle" });
      const colorClass = kind === "bg"
        ? color.class
        : color.class.replace(/^hl-/, "hlt-");
      const isActive = activeClass === colorClass;
      const tooltip = isActive
        ? `Remove ${labelText.toLowerCase()}: ${color.name.toLowerCase()}`
        : `${labelText}: ${color.name.toLowerCase()}`;
      circle.setAttribute("aria-label", tooltip);
      circle.setAttribute("title", tooltip);
      circle.setAttribute("aria-pressed", String(isActive));
      if (isActive) circle.addClass("is-active");
      if (kind === "bg") {
        circle.setCssProps({
          "--circle-bg": color.bg,
          "--circle-border": color.color,
        });
      } else {
        circle.addClass("hl-text-circle");
        circle.setCssProps({ "--circle-text": color.bg });
        circle.setText("A");
      }

      circle.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.suppressSelectionHandling();
        const action = isActive
          ? this.removeColor(editor, kind)
          : this.applyColor(editor, color, kind);
        void this.finishPaletteAction(action);
      });
      row.appendChild(circle);
    });

    return row;
  }

  private showPaletteFromCommand(editor: Editor): void {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    const selectionInfo = getSelection(editor);
    if (!activeView || !selectionInfo) {
      new Notice("Select text first. / 请先选中文字。");
      return;
    }

    const sourceText = this.getSourceText(editor);
    if (
      sourceText &&
      selectionOverlapsProtectedMarkdown(sourceText, selectionInfo)
    ) {
      new Notice(
        "Highlighting is unavailable inside code, math, links, or properties."
      );
      return;
    }

    let rect: SelectionRectLike | null = null;
    const domSelection = activeWindow.getSelection();
    if (
      domSelection?.anchorNode &&
      domSelection.rangeCount > 0 &&
      activeView.containerEl.contains(domSelection.anchorNode)
    ) {
      const rangeRect = domSelection.getRangeAt(0).getBoundingClientRect();
      if (hasUsableSelectionRect(rangeRect)) rect = rangeRect;
    }

    if (!rect) {
      const cmView = getCmView(editor);
      const start = cmView?.coordsAtPos?.(selectionInfo.from);
      const end = cmView?.coordsAtPos?.(selectionInfo.to);
      if (start && end) {
        const left = Math.min(start.left, end.left);
        const right = Math.max(start.right, end.right);
        const top = Math.min(start.top, end.top);
        const bottom = Math.max(start.bottom, end.bottom);
        rect = {
          top,
          right,
          bottom,
          left,
          width: right - left,
          height: bottom - top,
        };
      }
    }

    if (!rect || !hasUsableSelectionRect(rect)) {
      new Notice("Unable to locate the selection. / 无法定位当前选区。");
      return;
    }

    this.currentSelection = selectionInfo;
    this.showPopover(rect, editor);
  }

  private buildRemoveButton(
    editor: Editor,
    action: PaletteRemoveAction
  ): HTMLButtonElement {
    const button = createEl("button", {
      cls: ["hl-color-circle", "hl-remove-circle"],
    });
    const label = action === "text" ? "Remove text color" : "Remove highlight";
    button.setAttribute("aria-label", label);
    button.setAttribute("title", label);
    button.dataset.action = action === "text" ? "remove-text" : "remove-all";
    setIcon(button, getPaletteRemoveIcon(action));
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.suppressSelectionHandling();
      const removal = action === "text"
        ? this.removeColor(editor, "text")
        : this.removeHighlight(editor);
      void this.finishPaletteAction(removal);
    });
    return button;
  }

  private removePopover(clearSelection: boolean) {
    this.popover?.remove();
    this.popover = null;
    if (clearSelection) {
      this.currentSelection = null;
      if (this.selectionTimer !== null) {
        window.clearTimeout(this.selectionTimer);
        this.selectionTimer = null;
      }
    }
  }

  private suppressSelectionHandling() {
    this.ignoreSelectionUntil = Date.now() + 350;
    if (this.selectionTimer !== null) {
      window.clearTimeout(this.selectionTimer);
      this.selectionTimer = null;
    }
  }

  private clearDomSelection() {
    const selection = activeWindow.getSelection();
    if (selection && !selection.isCollapsed) selection.removeAllRanges();
  }

  private async finishPaletteAction(action: Promise<void>): Promise<void> {
    try {
      await action;
    } finally {
      this.removePopover(true);
    }
  }

  private getSourceText(editor: Editor): string | null {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (activeView?.getMode() === "preview") return activeView.getViewData();
    return getCmView(editor)?.state.doc.toString() ?? null;
  }

  private async replaceRange(
    editor: Editor,
    replacement: string,
    selectionInfo: SelectionInfo
  ): Promise<boolean> {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (activeView?.getMode() === "preview" && activeView.file) {
      try {
        await this.app.vault.process(activeView.file, (source) => {
          const updated = replaceExactSourceRange(
            source,
            selectionInfo,
            replacement
          );
          if (updated === null) throw new Error("The note changed after selection");
          return updated;
        });
        return true;
      } catch {
        new Notice("Selection changed; please select the text again.");
        return false;
      }
    }

    const cmView = getCmView(editor);
    if (cmView) {
      cmView.dispatch({
        changes: {
          from: selectionInfo.from,
          to: selectionInfo.to,
          insert: replacement,
        },
      });
    } else {
      editor.replaceRange(
        replacement,
        editor.offsetToPos(selectionInfo.from),
        editor.offsetToPos(selectionInfo.to)
      );
    }
    return true;
  }

  private async applyColor(
    editor: Editor,
    color: HighlightColor,
    kind: HighlightKind
  ): Promise<void> {
    let selectionInfo = this.currentSelection ?? getSelection(editor);
    if (!selectionInfo) return;

    const sourceText = this.getSourceText(editor);
    if (
      sourceText &&
      selectionOverlapsProtectedMarkdown(sourceText, selectionInfo)
    ) {
      new Notice(
        "Highlighting is unavailable inside code, math, links, or properties."
      );
      this.currentSelection = null;
      return;
    }
    const newClass = kind === "bg"
      ? color.class
      : color.class.replace(/^hl-/, "hlt-");
    const edit = sourceText
      ? applyColorToSelection(sourceText, selectionInfo, newClass, kind)
      : {
          from: selectionInfo.from,
          to: selectionInfo.to,
          insert: applyColorToText(selectionInfo.text, newClass, kind),
        };
    const editSelection = {
      from: edit.from,
      to: edit.to,
      text: sourceText
        ? sourceText.slice(edit.from, edit.to)
        : selectionInfo.text,
    };
    if (await this.replaceRange(editor, edit.insert, editSelection)) {
      this.clearDomSelection();
    }
    this.currentSelection = null;
  }

  private async removeColor(
    editor: Editor,
    kind: HighlightKind
  ): Promise<void> {
    const selectionInfo = this.getSelectionOrContainingMark(editor);
    if (!selectionInfo) return;

    const sourceText = this.getSourceText(editor);
    const edit = sourceText
      ? removeColorFromSelection(sourceText, selectionInfo, kind)
      : {
          from: selectionInfo.from,
          to: selectionInfo.to,
          insert: removeColorFromSelection(
            selectionInfo.text,
            { text: selectionInfo.text, from: 0, to: selectionInfo.text.length },
            kind
          ).insert,
        };
    const editSelection = {
      from: edit.from,
      to: edit.to,
      text: sourceText
        ? sourceText.slice(edit.from, edit.to)
        : selectionInfo.text,
    };
    if (await this.replaceRange(editor, edit.insert, editSelection)) {
      this.clearDomSelection();
    }
    this.currentSelection = null;
  }

  private getSelectionOrContainingMark(editor: Editor): SelectionInfo | null {
    const selectionInfo = this.currentSelection ?? getSelection(editor);
    if (selectionInfo) return selectionInfo;

    const cmView = getCmView(editor);
    return cmView
      ? findPluginMarkAtOffset(
          cmView.state.doc.toString(),
          cmView.state.selection.main.from
        )
      : null;
  }

  private async removeHighlight(editor: Editor): Promise<void> {
    const selectionInfo = this.getSelectionOrContainingMark(editor);
    if (!selectionInfo) return;

    const sourceText = this.getSourceText(editor);
    const edit = sourceText
      ? removeHighlightFromSelection(sourceText, selectionInfo)
      : {
          from: selectionInfo.from,
          to: selectionInfo.to,
          insert: removeHighlightsFromText(selectionInfo.text),
        };
    const editSelection = {
      from: edit.from,
      to: edit.to,
      text: sourceText
        ? sourceText.slice(edit.from, edit.to)
        : selectionInfo.text,
    };
    if (await this.replaceRange(editor, edit.insert, editSelection)) {
      this.clearDomSelection();
    }
    this.currentSelection = null;
  }

  async updateSettings(
    patch: Partial<RainbowHighlightSettings>
  ): Promise<void> {
    this.settings = normalizeSettings({ ...this.settings, ...patch });
    await this.saveData(this.settings);
    this.removePopover(true);
  }

  private async loadSettings(): Promise<void> {
    this.settings = normalizeSettings(await this.loadData());
  }

  private async showWelcomeOnce(): Promise<void> {
    if (this.settings.hasSeenWelcome) return;
    new Notice(
      "Select text to open the palette. Active colors can be removed with one click. / 选中文字即可打开调色盘，点击已选颜色可直接取消。",
      8000
    );
    await this.updateSettings({ hasSeenWelcome: true });
  }
}
