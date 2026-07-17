/**
 * 답안지 단일 contenteditable 편집기 — 10페이지, 작성 화면 DOM이 정답
 */
import {
  ANSWER_PAGE_COUNT,
  ROWS_PER_PAGE,
  TOTAL_ROWS,
  createEmptyAnswerSheet,
  normalizeAnswerPages,
} from "./workspace-answer-editor.js";
import {
  formatCircledNumber,
  parseTypedCircledPattern,
  CIRCLED_MAX,
  CIRCLED_LIMIT_MESSAGE,
  computeNextCircledNumber,
  buildCircledInsertPlan,
  createCircledSession,
} from "./workspace-numbering.js";
import {
  finalizeSheetClone,
  mountOffscreenSheet,
  cloneSheetFromMount,
  SHEET_MARKUP,
  ensureAnswerDrawLayers,
} from "./workspace-answer-clone.js";
import {
  splitHtmlAtVisualLines,
  countVisualLines,
  countNonEmptyVisualLines,
} from "./workspace-answer-visual.js";
import {
  applyAnswerSheetVars,
  copyAnswerSheetLayoutFromSource,
  DEFAULT_ANSWER_FONT_SIZE,
  DEFAULT_ANSWER_LETTER_SPACING,
  normalizeAnswerTypography,
  syncAnswerSheetRowHeights,
} from "./workspace-answer-typography.js";
import {
  getEditorContent,
  setEditorContent,
  plainTextFromHtml,
  stripFormatSpansFromHtml,
  stripFormatSpansFromNode,
} from "./workspace-answer-format.js";

export { ANSWER_PAGE_COUNT, ROWS_PER_PAGE, TOTAL_ROWS };

export const LINE_HEIGHT_PX = 28;
const SAVE_DEBOUNCE_MS = 400;

/** @deprecated legacy row format */
export function rowsToPageText(rows) {
  if (typeof rows === "string") return rows;
  const slice = (rows || []).slice(0, ROWS_PER_PAGE);
  let end = slice.length;
  while (end > 1 && !String(slice[end - 1] || "").length) {
    end--;
  }
  return slice.slice(0, end).join("\n");
}

export function getPageText(sheet, pageIndex) {
  const pages = normalizeAnswerPages(sheet);
  return String(pages[pageIndex] ?? "");
}

export function countPageUsedRowsFromText(text, editorEl) {
  if (editorEl) return countNonEmptyVisualLines(editorEl);
  const mount = mountOffscreenSheet(0, text, null);
  const count = countNonEmptyVisualLines(mount.querySelector(".answer-doc-editor"));
  mount.remove();
  return count;
}

export function getCaretTextOffset(root) {
  const sel = window.getSelection();
  if (!sel?.rangeCount || !root) return 0;
  const range = sel.getRangeAt(0);
  const pre = range.cloneRange();
  pre.selectNodeContents(root);
  pre.setEnd(range.endContainer, range.endOffset);
  return pre.toString().length;
}

export function setCaretTextOffset(root, offset) {
  if (!root) return;
  const sel = window.getSelection();
  const range = document.createRange();
  let remaining = Math.max(0, offset);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const len = node.textContent?.length || 0;
    if (remaining <= len) {
      range.setStart(node, remaining);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
    remaining -= len;
    node = walker.nextNode();
  }
  range.selectNodeContents(root);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

export function createAnswerDocumentController({
  container,
  getState,
  setState,
  onChange,
  onPageChange,
  onAnswerSelection,
  showToast,
}) {
  let editorEl = null;
  let undoStack = [];
  let redoStack = [];
  let isComposing = false;
  let saveTimer = null;
  let boundEditor = null;
  let lastRenderedPageIndex = null;

  let savedAnswerRange = null;
  let savedAnswerPageIndex = null;
  let savedCaretOffset = null;
  let activeAnswerSelection = null;

  function getEditor() {
    return editorEl || container?.querySelector(".answer-doc-editor") || null;
  }

  function getLiveSheetWidth() {
    const sheet = container?.querySelector(".answer-doc-sheet");
    return sheet ? Math.round(sheet.getBoundingClientRect().width) : null;
  }

  function saveAnswerSelection() {
    const editor = getEditor();
    const selection = window.getSelection();
    if (!editor || !selection || selection.rangeCount === 0) return false;

    const range = selection.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) return false;

    savedAnswerRange = range.cloneRange();
    savedAnswerPageIndex = getState().pageIndex;
    savedCaretOffset = getCaretTextOffset(editor);
    return true;
  }

  function restoreAnswerSelection() {
    const editor = getEditor();
    if (!editor) return false;

    if (savedAnswerPageIndex != null && savedAnswerPageIndex !== getState().pageIndex) {
      return false;
    }

    if (savedAnswerRange) {
      try {
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(savedAnswerRange);
        return true;
      } catch {
        // detached range
      }
    }

    if (savedCaretOffset != null) {
      setCaretTextOffset(editor, savedCaretOffset);
      return true;
    }
    return false;
  }

  function clearSavedSelection() {
    savedAnswerRange = null;
    savedAnswerPageIndex = null;
    savedCaretOffset = null;
  }

  function clearActiveAnswerSelection() {
    activeAnswerSelection = null;
    clearSavedSelection();
    window.getSelection()?.removeAllRanges();
  }

  function captureActiveAnswerSelection() {
    if (isComposing) return null;
    const editor = getEditor();
    const selection = window.getSelection();
    if (!editor || !selection?.rangeCount) return null;

    const range = selection.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer) || range.collapsed) return null;

    const text = selection.toString();
    if (!text.trim()) return null;

    const pageId = getState().pageIndex;
    activeAnswerSelection = {
      range: range.cloneRange(),
      pageId,
      editor,
      text,
    };
    savedAnswerRange = activeAnswerSelection.range.cloneRange();
    savedAnswerPageIndex = pageId;
    savedCaretOffset = getCaretTextOffset(editor);
    return activeAnswerSelection;
  }

  function getActiveAnswerSelection() {
    return activeAnswerSelection ? { ...activeAnswerSelection } : null;
  }

  function getSelectionAnchorRect() {
    const editor = getEditor();
    if (!editor) return null;

    const selection = window.getSelection();
    if (selection?.rangeCount) {
      const live = selection.getRangeAt(0);
      if (editor.contains(live.commonAncestorContainer) && !live.collapsed) {
        const rect = live.getBoundingClientRect();
        if (rect.width > 0 || rect.height > 0) return rect;
        const probe = live.cloneRange();
        probe.collapse(true);
        const rects = probe.getClientRects();
        if (rects.length) return rects[0];
      }
    }

    if (activeAnswerSelection?.range) {
      try {
        const range = activeAnswerSelection.range.cloneRange();
        if (editor.contains(range.commonAncestorContainer)) {
          const rect = range.getBoundingClientRect();
          if (rect.width > 0 || rect.height > 0) return rect;
          const probe = range.cloneRange();
          probe.collapse(true);
          const rects = probe.getClientRects();
          if (rects.length) return rects[0];
        }
      } catch {
        // detached range
      }
    }

    return editor.getBoundingClientRect();
  }

  function insertTextAtRange(text) {
    const editor = getEditor();
    if (!editor) return false;

    editor.focus();
    if (!restoreAnswerSelection()) {
      const sel = window.getSelection();
      if (!sel?.rangeCount) {
        setCaretTextOffset(editor, savedCaretOffset ?? editor.innerText.length);
      }
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return false;

    const range = selection.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) return false;

    range.deleteContents();
    const node = document.createTextNode(text);
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);

    savedCaretOffset = getCaretTextOffset(editor);
    schedulePersist();
    return true;
  }

  function getAnswerTypography() {
    return normalizeAnswerTypography({
      fontSize: getState().answerFontSize ?? DEFAULT_ANSWER_FONT_SIZE,
      letterSpacing: getState().answerLetterSpacing ?? DEFAULT_ANSWER_LETTER_SPACING,
    });
  }

  function applyTypographyVars() {
    const t = getAnswerTypography();
    if (container) applyAnswerSheetVars(container, t);
    const sheet = container?.querySelector(".answer-doc-sheet");
    if (sheet) applyAnswerSheetVars(sheet, t);
    requestAnimationFrame(() => {
      const liveSheet = container?.querySelector(".answer-doc-sheet");
      if (liveSheet) syncAnswerSheetRowHeights(liveSheet);
    });
  }

  function decorateClone(clone, liveSheet) {
    if (!clone) return clone;
    applyAnswerSheetVars(clone, getAnswerTypography());
    if (liveSheet) copyAnswerSheetLayoutFromSource(clone, liveSheet);
    return finalizeSheetClone(clone);
  }

  function render(force = false) {
    if (!container) return;

    const { pageIndex, caretOffset } = getState();
    const pageContent = getPageText(getState().sheet, pageIndex);
    const existing = container.querySelector(".answer-doc-editor");

    if (existing && existing === editorEl) {
      const sheetEl = container.querySelector(".answer-doc-sheet");
      if (sheetEl) {
        sheetEl.dataset.page = String(pageIndex + 1);
        const pageLabel = sheetEl.querySelector(".answer-doc-page");
        if (pageLabel) pageLabel.textContent = `${pageIndex + 1} / ${ANSWER_PAGE_COUNT}`;
        ensureAnswerDrawLayers(sheetEl.querySelector(".answer-doc-body"));
      }
      const pageChanged = lastRenderedPageIndex !== pageIndex;
      if (pageChanged || getEditorContent(existing) !== pageContent) {
        setEditorContent(existing, pageContent);
        lastRenderedPageIndex = pageIndex;
      }
      applyTypographyVars();
      requestAnimationFrame(() =>
        setCaretTextOffset(existing, caretOffset ?? (existing.innerText || "").length)
      );
      return;
    }

    container.innerHTML = SHEET_MARKUP(pageIndex);
    editorEl = container.querySelector(".answer-doc-editor");
    editorEl.contentEditable = "true";
    setEditorContent(editorEl, pageContent);
    lastRenderedPageIndex = pageIndex;
    bindEditor();
    applyTypographyVars();
    requestAnimationFrame(() =>
      setCaretTextOffset(editorEl, caretOffset ?? (editorEl.innerText || "").length)
    );
  }

  function persistPageHtmlFromEditor() {
    const editor = getEditor();
    if (!editor) return;
    stripFormatSpansFromNode(editor);
    const { sheet, pageIndex } = getState();
    const pages = normalizeAnswerPages(sheet);
    const copy = [...pages];
    copy[pageIndex] = stripFormatSpansFromHtml(getEditorContent(editor));
    setState({ sheet: copy });
  }

  function pushUndo() {
    const editor = getEditor();
    if (editor && !isComposing) {
      persistPageHtmlFromEditor();
    }
    const { sheet } = getState();
    undoStack.push([...normalizeAnswerPages(sheet)]);
    if (undoStack.length > 50) undoStack.shift();
    redoStack = [];
    const ws = getState().workspaceUndo;
    if (ws) {
      ws.answerUndoStack = undoStack;
      ws.answerRedoStack = redoStack;
    }
  }

  function persistEditorToSheet(allowOverflow = true, force = false) {
    const editor = getEditor();
    if (!editor || isComposing) return getState().sheet;

    stripFormatSpansFromNode(editor);

    const { sheet, pageIndex } = getState();
    const pages = normalizeAnswerPages(sheet);
    const { kept, overflow, keptHtml, overflowHtml } = splitHtmlAtVisualLines(editor, ROWS_PER_PAGE);
    let caret = getCaretTextOffset(editor);

    const copy = [...pages];
    copy[pageIndex] = stripFormatSpansFromHtml(keptHtml);

    let nextPage = pageIndex;

    if (overflow.length && allowOverflow) {
      if (pageIndex >= ANSWER_PAGE_COUNT - 1) {
        showToast?.("답안지 최대 분량에 도달했습니다");
        if (editor.innerText.replace(/\r/g, "") !== kept) {
          setEditorContent(editor, keptHtml);
          setCaretTextOffset(editor, Math.min(caret, kept.length));
        }
      } else {
        nextPage = pageIndex + 1;
        const nextExisting = copy[nextPage] || "";
        copy[nextPage] = stripFormatSpansFromHtml(overflowHtml + nextExisting);
        if (editor.innerText.replace(/\r/g, "") !== kept) {
          setEditorContent(editor, keptHtml);
          setCaretTextOffset(editor, Math.min(caret, kept.length));
        }
        caret = getCaretTextOffset(editor);
        onPageChange?.(nextPage);
        showToast?.("다음 답안지 페이지로 이동했습니다");
      }
    } else if (overflow.length) {
      setEditorContent(editor, keptHtml);
      setCaretTextOffset(editor, Math.min(caret, kept.length));
    }

    const pageChanged = nextPage !== pageIndex;
    setState({ sheet: copy, pageIndex: nextPage, caretOffset: caret });
    if (pageChanged) {
      lastRenderedPageIndex = null;
      render(true);
    }
    onChange?.();
    return copy;
  }

  function schedulePersist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (!isComposing) {
        persistEditorToSheet(true);
      }
    }, SAVE_DEBOUNCE_MS);
  }

  function tryConvertCircledOnSpace(editor) {
    const caret = getCaretTextOffset(editor);
    const text = editor.innerText.replace(/\r/g, "");
    const before = text.slice(0, caret);
    const after = text.slice(caret);
    const lineStart = Math.max(0, before.lastIndexOf("\n") + 1);
    const lineBeforeCaret = before.slice(lineStart);
    const num = parseTypedCircledPattern(lineBeforeCaret);
    if (!num) return false;

    pushUndo();
    const token = `${formatCircledNumber(num)} `;
    const newBefore = before.slice(0, lineStart) + token;
    const newText = newBefore + after;
    editor.textContent = newText;
    const newCaret = newBefore.length;
    setCaretTextOffset(editor, newCaret);
    setState({ caretOffset: newCaret });
    schedulePersist();
    return true;
  }

  function bindEditor() {
    const editor = getEditor();
    if (!editor || editor === boundEditor) return;
    boundEditor = editor;

    editor.addEventListener("compositionstart", () => {
      isComposing = true;
    });

    editor.addEventListener("compositionend", () => {
      isComposing = false;
      schedulePersist();
    });

    editor.addEventListener("input", () => {
      if (isComposing) return;
      if (!getState().editStarted) {
        pushUndo();
        setState({ editStarted: true });
        setTimeout(() => setState({ editStarted: false }), 0);
      }
      setState({ caretOffset: getCaretTextOffset(editor) });
      schedulePersist();
    });

    editor.addEventListener("keydown", (e) => {
      if (isComposing) return;
      const { pageIndex, sheet } = getState();
      const pages = normalizeAnswerPages(sheet);

      if (e.key === " " && tryConvertCircledOnSpace(editor)) {
        e.preventDefault();
        return;
      }

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        pushUndo();

        const text = editor.innerText.replace(/\r/g, "");
        const caret = getCaretTextOffset(editor);
        const before = text.slice(0, caret);
        const after = text.slice(caret);
        const insert = "\n";

        const newText = before + insert + after;
        editor.textContent = newText;
        const newCaret = before.length + insert.length;
        setCaretTextOffset(editor, newCaret);
        setState({ caretOffset: newCaret });
        schedulePersist();
        return;
      }

      if (e.key === "Backspace") {
        const caret = getCaretTextOffset(editor);
        const text = editor.innerText.replace(/\r/g, "");
        if (caret === 0 && pageIndex > 0) {
          e.preventDefault();
          pushUndo();
          persistEditorToSheet(false);
          const copy = [...pages];
          const prevHtml = copy[pageIndex - 1] || "";
          const currentHtml = getEditorContent(editor);
          const merged = prevHtml + currentHtml;
          copy[pageIndex - 1] = merged;
          copy[pageIndex] = "";
          const newCaret = plainTextFromHtml(prevHtml).length;
          onPageChange?.(pageIndex - 1);
          setState({ sheet: copy, pageIndex: pageIndex - 1, caretOffset: newCaret });
          render(true);
          onChange?.();
        }
      }
    });

    editor.addEventListener("paste", (e) => {
      e.preventDefault();
      const pasted = e.clipboardData?.getData("text/plain") || "";
      if (!pasted) return;
      pushUndo();
      const caret = getCaretTextOffset(editor);
      const text = editor.innerText.replace(/\r/g, "");
      editor.textContent = text.slice(0, caret) + pasted + text.slice(caret);
      setCaretTextOffset(editor, caret + pasted.length);
      schedulePersist();
    });

    editor.addEventListener("mouseup", () => {
      setState({ caretOffset: getCaretTextOffset(editor) });
      if (isComposing) return;
      const captured = captureActiveAnswerSelection();
      if (captured) onAnswerSelection?.(captured);
    });
    editor.addEventListener("keyup", () => {
      if (!isComposing) setState({ caretOffset: getCaretTextOffset(editor) });
    });
  }

  function buildSheetClone(pageIndex, pageText) {
    const { pageIndex: liveIndex } = getState();
    const liveSheet = container?.querySelector(".answer-doc-sheet");
    if (pageIndex === liveIndex && liveSheet) {
      return decorateClone(liveSheet.cloneNode(true), liveSheet);
    }
    const width = getLiveSheetWidth();
    const mount = mountOffscreenSheet(pageIndex, pageText, width, getAnswerTypography());
    const clone = cloneSheetFromMount(mount);
    mount.remove();
    return decorateClone(clone, liveSheet);
  }

  return {
    render,
    applyTypographyVars,
    saveAnswerSelection,
    restoreAnswerSelection,
    clearSavedSelection,
    cloneCurrentSheet() {
      const liveSheet = container?.querySelector(".answer-doc-sheet");
      return liveSheet ? decorateClone(liveSheet.cloneNode(true), liveSheet) : null;
    },
    cloneSheetForPage(pageIndex) {
      persistEditorToSheet(false, true);
      const pages = normalizeAnswerPages(getState().sheet);
      return buildSheetClone(pageIndex, pages[pageIndex] || "");
    },
    cloneAllSheets() {
      persistEditorToSheet(false, true);
      const pages = normalizeAnswerPages(getState().sheet);
      return Array.from({ length: ANSWER_PAGE_COUNT }, (_, i) =>
        buildSheetClone(i, pages[i] || "")
      );
    },
    countCurrentVisualLines() {
      const editor = getEditor();
      return editor ? countVisualLines(editor) : 0;
    },
    countCurrentUsedLines() {
      const editor = getEditor();
      return editor ? countNonEmptyVisualLines(editor) : 0;
    },
    setNumberMenuOpen(_open) {
      // legacy no-op
    },
    insertCircledNumber({ resetSession = false } = {}) {
      clearTimeout(saveTimer);
      persistEditorToSheet(false, true);
      const editor = getEditor();
      if (!editor) return { ok: false };

      editor.focus();
      if (!restoreAnswerSelection()) {
        const caret = savedCaretOffset ?? getState().caretOffset ?? editor.innerText.length;
        setCaretTextOffset(editor, caret);
      }

      const { pageIndex, sheet, circledNumberSession } = getState();
      const pages = normalizeAnswerPages(sheet);
      const text = editor.innerText.replace(/\r/g, "");
      const caret = getCaretTextOffset(editor);

      let session = circledNumberSession;
      if (resetSession || !session) {
        session = createCircledSession(pageIndex, caret);
      }

      const nextNum = resetSession
        ? 1
        : !circledNumberSession
          ? 1
          : computeNextCircledNumber(pages, session, plainTextFromHtml);

      if (nextNum > CIRCLED_MAX) {
        showToast?.(CIRCLED_LIMIT_MESSAGE);
        return { ok: false, reason: "limit" };
      }

      const plan = buildCircledInsertPlan(text, caret, nextNum);
      pushUndo();

      const before = text.slice(0, plan.insertAt);
      const after = text.slice(plan.insertAt + plan.deleteCount);
      const newText = before + plan.insertText + after;
      editor.textContent = newText;
      setCaretTextOffset(editor, plan.newCaret);

      const updatedSession =
        resetSession
          ? createCircledSession(pageIndex, caret)
          : !circledNumberSession
            ? createCircledSession(pageIndex, plan.insertAt)
            : session;

      setState({
        caretOffset: plan.newCaret,
        circledNumberSession: updatedSession,
      });
      schedulePersist();
      return { ok: true, num: nextNum, session: updatedSession };
    },
    insertAtSavedRange(text) {
      clearTimeout(saveTimer);
      persistEditorToSheet(false, true);
      pushUndo();
      const ok = insertTextAtRange(text);
      clearSavedSelection();
      if (ok) getEditor()?.focus();
      schedulePersist();
      return ok;
    },
    insertAtCursor(text) {
      saveAnswerSelection();
      return insertTextAtRange(text);
    },
    deleteCurrentLine() {
      const editor = getEditor();
      if (!editor) return;
      const text = editor.innerText.replace(/\r/g, "");
      const caret = getCaretTextOffset(editor);
      const before = text.slice(0, caret);
      const lineStart = Math.max(0, before.lastIndexOf("\n") + 1);
      const lineEnd = text.indexOf("\n", caret);
      const end = lineEnd < 0 ? text.length : lineEnd + 1;
      pushUndo();
      editor.textContent = text.slice(0, lineStart) + text.slice(end);
      setCaretTextOffset(editor, lineStart);
      schedulePersist();
    },
    flushPersist() {
      clearTimeout(saveTimer);
      persistEditorToSheet(true, true);
    },
    undo() {
      if (!undoStack.length) return;
      redoStack.push([...normalizeAnswerPages(getState().sheet)]);
      const prev = undoStack.pop();
      setState({ sheet: prev, caretOffset: 0 });
      render(true);
      onChange?.();
    },
    redo() {
      if (!redoStack.length) return;
      undoStack.push([...normalizeAnswerPages(getState().sheet)]);
      const next = redoStack.pop();
      setState({ sheet: next, caretOffset: 0 });
      render(true);
      onChange?.();
    },
    getEditorEl: () => getEditor(),
    isComposing: () => isComposing,
    captureActiveAnswerSelection,
    getActiveAnswerSelection,
    clearActiveAnswerSelection,
    getSelectionAnchorRect,
    getSelectionText: () => {
      if (activeAnswerSelection?.text) return activeAnswerSelection.text.trim();
      const sel = window.getSelection();
      return sel?.toString()?.trim() || "";
    },
    setUndoStacks(undo, redo) {
      undoStack = undo || [];
      redoStack = redo || [];
    },
  };
}

export function sheetFromLegacy(data) {
  return normalizeAnswerPages(data);
}
