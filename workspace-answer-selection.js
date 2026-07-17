/**
 * 답안 선택 플로팅 메뉴 — Answer Coach / 취소
 */

export function positionFloatingMenu(menuEl, rect, { offsetY = 8, width = 180, height = 40 } = {}) {
  if (!menuEl || !rect) return;
  const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
  const top = Math.min(rect.bottom + offsetY, window.innerHeight - height - 8);
  menuEl.style.left = `${left}px`;
  menuEl.style.top = `${top}px`;
}

export function createAnswerSelectionUi({
  selectionMenuEl,
  coachBtn,
  cancelBtn,
  onOpenCoach,
  onCancelSelection,
  getAnchorRect,
}) {
  let menuOpen = false;

  const preservePointerDown = (el) => {
    el?.addEventListener("pointerdown", (e) => e.preventDefault());
  };

  [coachBtn, cancelBtn].forEach(preservePointerDown);
  selectionMenuEl?.querySelectorAll("button").forEach((el) => {
    el.addEventListener("pointerdown", (e) => e.preventDefault());
  });

  function showSelectionMenu() {
    if (!selectionMenuEl) return;
    const rect = getAnchorRect?.();
    if (!rect) return;
    positionFloatingMenu(selectionMenuEl, rect);
    selectionMenuEl.hidden = false;
    menuOpen = true;
  }

  function hideSelectionMenu() {
    if (!selectionMenuEl) return;
    selectionMenuEl.hidden = true;
    menuOpen = false;
  }

  function closeAll() {
    hideSelectionMenu();
  }

  coachBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    onOpenCoach?.();
  });

  cancelBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    onCancelSelection?.();
    closeAll();
  });

  return {
    showSelectionMenu,
    hideSelectionMenu,
    closeAll,
    isMenuOpen: () => menuOpen,
  };
}
