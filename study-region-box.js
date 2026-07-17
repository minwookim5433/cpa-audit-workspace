/**
 * Study — 리사이즈·이동 가능한 영역 선택 박스
 */

export function createRegionBox(overlay, container, canvas, outputScale, onUpdate) {
  let rect = null;
  let dragMode = null;
  let start = null;

  const boxEl = document.createElement("div");
  boxEl.className = "region-selection-box";
  boxEl.hidden = true;

  ["nw", "n", "ne", "e", "se", "s", "sw", "w"].forEach((h) => {
    const el = document.createElement("div");
    el.className = `region-handle region-handle-${h}`;
    el.dataset.handle = h;
    boxEl.append(el);
  });

  const moveBar = document.createElement("div");
  moveBar.className = "region-move-bar";
  moveBar.title = "드래그하여 이동";
  boxEl.prepend(moveBar);

  overlay.append(boxEl);

  function getBoxBounds() {
    return container.getBoundingClientRect();
  }

  function notifyUpdate(finalized, clientX, clientY, isNewSelection = false) {
    if (!rect) {
      onUpdate?.(null);
      return;
    }
    const bounds = getBoxBounds();
    onUpdate?.({
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      previewDataUrl: cropCanvas(canvas, rect, outputScale),
      relRects: [
        {
          left: rect.left / bounds.width,
          top: rect.top / bounds.height,
          width: rect.width / bounds.width,
          height: rect.height / bounds.height,
        },
      ],
      clientX,
      clientY,
      finalized,
      isNewSelection: Boolean(isNewSelection),
    });
  }

  function applyRect(finalized = false, clientX, clientY, isNewSelection = false) {
    if (!rect) {
      boxEl.hidden = true;
      return;
    }
    boxEl.hidden = false;
    boxEl.style.left = `${rect.left}px`;
    boxEl.style.top = `${rect.top}px`;
    boxEl.style.width = `${rect.width}px`;
    boxEl.style.height = `${rect.height}px`;
    if (finalized) notifyUpdate(true, clientX, clientY, isNewSelection);
  }

  function setRect(r) {
    const bounds = getBoxBounds();
    const w = Math.max(12, Math.min(r.width, bounds.width));
    const h = Math.max(12, Math.min(r.height, bounds.height));
    rect = {
      left: Math.max(0, Math.min(r.left, bounds.width - w)),
      top: Math.max(0, Math.min(r.top, bounds.height - h)),
      width: w,
      height: h,
    };
    applyRect();
  }

  function onPointerDown(e, mode) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    dragMode = mode;
    start = { mx: e.clientX, my: e.clientY, rect: { ...rect }, bounds: getBoxBounds() };
    document.addEventListener("mousemove", onPointerMove);
    document.addEventListener("mouseup", onPointerUp);
  }

  function onPointerMove(e) {
    if (!dragMode || !start || !rect) return;
    const dx = e.clientX - start.mx;
    const dy = e.clientY - start.my;
    const r = { ...start.rect };

    if (dragMode === "move") {
      setRect({ left: r.left + dx, top: r.top + dy, width: r.width, height: r.height });
      return;
    }

    if (dragMode.includes("w")) {
      r.left = start.rect.left + dx;
      r.width = start.rect.width - dx;
    }
    if (dragMode.includes("e")) r.width = start.rect.width + dx;
    if (dragMode.includes("n")) {
      r.top = start.rect.top + dy;
      r.height = start.rect.height - dy;
    }
    if (dragMode.includes("s")) r.height = start.rect.height + dy;
    if (r.width < 12) {
      if (dragMode.includes("w")) r.left = start.rect.left + start.rect.width - 12;
      r.width = 12;
    }
    if (r.height < 12) {
      if (dragMode.includes("n")) r.top = start.rect.top + start.rect.height - 12;
      r.height = 12;
    }
    setRect(r);
  }

  function onPointerUp(e) {
    dragMode = null;
    start = null;
    document.removeEventListener("mousemove", onPointerMove);
    document.removeEventListener("mouseup", onPointerUp);
    if (rect) applyRect(true, e?.clientX, e?.clientY, false);
  }

  moveBar.addEventListener("mousedown", (e) => onPointerDown(e, "move"));
  boxEl.querySelectorAll(".region-handle").forEach((h) => {
    h.addEventListener("mousedown", (e) => onPointerDown(e, h.dataset.handle));
  });

  overlay.addEventListener("mousedown", (e) => {
    if (e.target !== overlay) return;
    const bounds = getBoxBounds();
    const x = e.clientX - bounds.left;
    const y = e.clientY - bounds.top;
    start = { mx: e.clientX, my: e.clientY, x, y, bounds };
    dragMode = "create";
    rect = { left: x, top: y, width: 0, height: 0 };
    applyRect();
    document.addEventListener("mousemove", onCreateMove);
    document.addEventListener("mouseup", onCreateUp);
  });

  function onCreateMove(e) {
    if (dragMode !== "create" || !start) return;
    const x = e.clientX - start.bounds.left;
    const y = e.clientY - start.bounds.top;
    setRect({
      left: Math.min(start.x, x),
      top: Math.min(start.y, y),
      width: Math.abs(x - start.x),
      height: Math.abs(y - start.y),
    });
  }

  function onCreateUp(e) {
    if (dragMode !== "create") return;
    document.removeEventListener("mousemove", onCreateMove);
    document.removeEventListener("mouseup", onCreateUp);
    dragMode = null;
    if (!rect || rect.width < 12 || rect.height < 12) {
      rect = null;
      boxEl.hidden = true;
      onUpdate?.(null);
      return;
    }
    const bounds = getBoxBounds();
    notifyUpdate(true, e.clientX, e.clientY, true);
  }

  return {
    setRect,
    clear() {
      rect = null;
      boxEl.hidden = true;
    },
    getRect: () => (rect ? { ...rect } : null),
  };
}

function cropCanvas(canvas, rect, outputScale) {
  const sx = outputScale?.sx || 1;
  const sy = outputScale?.sy || 1;
  const crop = document.createElement("canvas");
  crop.width = Math.max(1, Math.floor(rect.width * sx));
  crop.height = Math.max(1, Math.floor(rect.height * sy));
  crop
    .getContext("2d")
    .drawImage(
      canvas,
      Math.floor(rect.left * sx),
      Math.floor(rect.top * sy),
      crop.width,
      crop.height,
      0,
      0,
      crop.width,
      crop.height
    );
  return crop.toDataURL("image/png");
}
