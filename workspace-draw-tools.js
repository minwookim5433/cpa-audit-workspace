/**
 * 시험지 자유 주석 — 밑줄, 형광펜, 펜, 지우개
 */
import { getCursorForTool } from "./workspace-draw-cursors.js";

export const LINE_COLORS = {
  red: "#e53935",
  blue: "#1e88e5",
  black: "#212121",
};

export const HIGHLIGHT_COLORS = {
  yellow: "rgba(255, 230, 0, 0.30)",
  green: "rgba(120, 220, 120, 0.30)",
  pink: "rgba(255, 150, 200, 0.30)",
};

export const PEN_COLORS = LINE_COLORS;

export const LINE_THICKNESS = 1;

export const PEN_WIDTHS = {
  thin: 0.0018,
  normal: 0.0032,
};

/** viewBox 0-100 기준 형광펜 굵기 (페이지 높이 대비 ~1.2-1.6%) */
export const HIGHLIGHT_WIDTH_NORM = 0.014;
export const HIGHLIGHT_WIDTH_MIN = 0.010;
export const HIGHLIGHT_WIDTH_MAX = 0.018;

/** 형광펜 y 오프셋 — 글자 중앙보다 약간 아래 */
export const HIGHLIGHT_Y_OFFSET = 0.004;

export const LINE_HIT_PX = 8;
export const HIGHLIGHT_HIT_PADDING_PX = 6;
export const PEN_HIT_PADDING_PX = 6;

export const TOOLS = {
  view: "view",
  underline: "underline",
  highlighter: "highlighter",
  pen: "pen",
  eraser: "eraser",
};

export function normalizeDrawTool(tool) {
  if (tool === "cursor") return TOOLS.view;
  return tool;
}

export function isDrawingTool(tool) {
  const t = normalizeDrawTool(tool);
  return t === TOOLS.underline || t === TOOLS.highlighter || t === TOOLS.pen;
}

export function isEraserTool(tool) {
  return normalizeDrawTool(tool) === TOOLS.eraser;
}

export function isInteractTool(tool) {
  return isDrawingTool(tool) || isEraserTool(tool);
}

/** 주석 모드: 텍스트 선택·드래그 방지 대상 */
export function isAnnotationMode(tool) {
  return isInteractTool(tool);
}

export function clampHighlightWidth(w) {
  return Math.max(HIGHLIGHT_WIDTH_MIN, Math.min(HIGHLIGHT_WIDTH_MAX, Number(w) || HIGHLIGHT_WIDTH_NORM));
}

export function getPenWidthNorm(widthKey) {
  return PEN_WIDTHS[widthKey] || PEN_WIDTHS.thin;
}

export function createLineAnnotation({ pdfFingerprint, pageNumber, x1, y1, x2, y2, color = "red" }) {
  return {
    id: `ln-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    type: "line",
    pdfFingerprint,
    pageNumber,
    x1: clamp01(x1),
    y1: clamp01(y1),
    x2: clamp01(x2),
    y2: clamp01(y2),
    color,
    thickness: LINE_THICKNESS,
    createdAt: new Date().toISOString(),
  };
}

export function createStrokeAnnotation({ pdfFingerprint, pageNumber, points, color = "yellow", width = HIGHLIGHT_WIDTH_NORM }) {
  const w = clampHighlightWidth(width);
  const offsetPoints = points.map(([x, y]) => [clamp01(x), clamp01(y + HIGHLIGHT_Y_OFFSET)]);
  return {
    id: `st-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    type: "stroke",
    pdfFingerprint,
    pageNumber,
    points: offsetPoints.map(([x, y]) => [clamp01(x), clamp01(y)]),
    color,
    width: w,
    createdAt: new Date().toISOString(),
  };
}

export function createPenAnnotation({
  pdfFingerprint,
  pageNumber,
  points,
  color = "red",
  width = "thin",
}) {
  const widthNorm = getPenWidthNorm(width);
  return {
    id: `pen-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    type: "pen",
    pdfFingerprint,
    pageNumber,
    points: points.map(([x, y]) => [clamp01(x), clamp01(y)]),
    color,
    width,
    widthNorm,
    createdAt: new Date().toISOString(),
  };
}

function clamp01(v) {
  return Math.max(0, Math.min(1, Number(v) || 0));
}

export function pixelToNorm(x, y, w, h) {
  return [clamp01(x / w), clamp01(y / h)];
}

export function pixelFromEvent(e, container) {
  const rect = container.getBoundingClientRect();
  return {
    px: e.clientX - rect.left,
    py: e.clientY - rect.top,
    w: rect.width,
    h: rect.height,
  };
}

export function snapLine(x1, y1, x2, y2, shiftKey) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (shiftKey || Math.abs(dy) < Math.abs(dx) * 0.15) {
    return { x1, y1, x2, y2: y1 };
  }
  return { x1, y1, x2, y2 };
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function strokeBounds(points, w, h, pad) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    const px = x * w;
    const py = y * h;
    minX = Math.min(minX, px);
    maxX = Math.max(maxX, px);
    minY = Math.min(minY, py);
    maxY = Math.max(maxY, py);
  }
  return { minX: minX - pad, maxX: maxX + pad, minY: minY - pad, maxY: maxY + pad };
}

function hitTestPolyline(points, px, py, w, h, threshold) {
  if (points.length < 2) return false;
  const bounds = strokeBounds(points, w, h, threshold);
  if (px < bounds.minX || px > bounds.maxX || py < bounds.minY || py > bounds.maxY) return false;
  for (let i = 0; i < points.length - 1; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    if (distToSegment(px, py, x1 * w, y1 * h, x2 * w, y2 * h) <= threshold) return true;
  }
  return false;
}

export function hitTestAnnotation(ann, px, py, w, h) {
  if (!ann || w <= 0 || h <= 0) return false;
  if (ann.type === "line") {
    return (
      distToSegment(px, py, ann.x1 * w, ann.y1 * h, ann.x2 * w, ann.y2 * h) <= LINE_HIT_PX
    );
  }
  if (ann.type === "stroke" && ann.points?.length > 1) {
    const threshold = (clampHighlightWidth(ann.width) * h) / 2 + HIGHLIGHT_HIT_PADDING_PX;
    return hitTestPolyline(ann.points, px, py, w, h, threshold);
  }
  if (ann.type === "pen" && ann.points?.length > 1) {
    const widthNorm = ann.widthNorm ?? getPenWidthNorm(ann.width);
    const threshold = (widthNorm * h) / 2 + PEN_HIT_PADDING_PX;
    return hitTestPolyline(ann.points, px, py, w, h, threshold);
  }
  return false;
}

/** 가장 최근 주석부터 hit test */
export function findHitAnnotation(annotations, pageNumber, px, py, w, h) {
  const pageAnns = (annotations || []).filter((a) => a.pageNumber === pageNumber);
  const sorted = [...pageAnns].sort((a, b) => {
    const ta = Date.parse(a.createdAt) || 0;
    const tb = Date.parse(b.createdAt) || 0;
    return tb - ta;
  });
  return sorted.find((ann) => hitTestAnnotation(ann, px, py, w, h)) || null;
}

export function renderDrawLayer(svgEl, annotations, pageNumber) {
  if (!svgEl) return;
  const items = (annotations || []).filter((a) => a.pageNumber === pageNumber);
  const parts = items.map((ann) => {
    if (ann.type === "line") {
      const col = LINE_COLORS[ann.color] || ann.color || LINE_COLORS.red;
      return `<g class="draw-line" data-id="${ann.id}" data-type="line">
        <line x1="${ann.x1 * 100}" y1="${ann.y1 * 100}" x2="${ann.x2 * 100}" y2="${ann.y2 * 100}"
          stroke="${col}" stroke-width="${LINE_THICKNESS}" vector-effect="non-scaling-stroke" stroke-linecap="round"/>
      </g>`;
    }
    if (ann.type === "stroke" && ann.points?.length > 1) {
      const pts = ann.points.map(([x, y]) => `${x * 100},${y * 100}`).join(" ");
      const col = HIGHLIGHT_COLORS[ann.color] || ann.color;
      const sw = clampHighlightWidth(ann.width) * 100;
      return `<polyline class="draw-stroke" data-id="${ann.id}" data-type="stroke" points="${pts}"
        fill="none" stroke="${col}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/>`;
    }
    if (ann.type === "pen" && ann.points?.length > 1) {
      const pts = ann.points.map(([x, y]) => `${x * 100},${y * 100}`).join(" ");
      const col = PEN_COLORS[ann.color] || ann.color || PEN_COLORS.red;
      const sw = (ann.widthNorm ?? getPenWidthNorm(ann.width)) * 100;
      return `<polyline class="draw-pen" data-id="${ann.id}" data-type="pen" points="${pts}"
        fill="none" stroke="${col}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" opacity="1"/>`;
    }
    return "";
  });
  svgEl.innerHTML = parts.join("");
}

export function createDrawController({
  getContainer,
  getInteractLayer,
  getAnnotations,
  setAnnotations,
  getToolState,
  onChange,
  onDelete,
}) {
  let drawing = null;
  let erasing = null;
  let activePointerId = null;
  let boundLayer = null;
  let windowBound = false;

  function getSvg() {
    return getContainer()?.querySelector(".draw-layer");
  }

  function refresh() {
    renderDrawLayer(getSvg(), getAnnotations(), getToolState().pageNumber);
    syncInteractLayer();
  }

  function syncInteractLayer() {
    const layer = boundLayer || getInteractLayer?.();
    const container = getContainer();
    const tool = normalizeDrawTool(getToolState().tool);
    const active = isInteractTool(tool);
    if (!layer) return;
    layer.classList.toggle("is-annotation-mode", active);
    layer.classList.toggle("is-drawing", isDrawingTool(tool));
    layer.classList.toggle("is-erasing", isEraserTool(tool));
    layer.style.pointerEvents = active ? "auto" : "none";
    layer.dataset.activeTool = active ? tool : "";
    const cursor = getCursorForTool(tool);
    layer.style.cursor = cursor || "";
    container?.classList.toggle("is-annotation-mode", active);
  }

  function normFromEvent(e) {
    const container = getContainer();
    if (!container) return [0, 0];
    const { px, py, w, h } = pixelFromEvent(e, container);
    return pixelToNorm(px, py, w, h);
  }

  function cancelActive() {
    drawing = null;
    erasing = null;
    if (activePointerId !== null && boundLayer) {
      try {
        boundLayer.releasePointerCapture(activePointerId);
      } catch {
        /* ignore */
      }
      activePointerId = null;
    }
    getSvg()?.querySelectorAll(".draw-preview, .draw-preview-stroke, .draw-preview-pen").forEach((el) => el.remove());
  }

  function tryEraseAt(e) {
    const container = getContainer();
    if (!container || !erasing) return;
    const { px, py, w, h } = pixelFromEvent(e, container);
    const ts = getToolState();
    const hit = findHitAnnotation(getAnnotations(), ts.pageNumber, px, py, w, h);
    if (!hit || erasing.deletedIds.has(hit.id)) return;
    erasing.deletedIds.add(hit.id);
    const anns = [...getAnnotations()];
    const idx = anns.findIndex((a) => a.id === hit.id);
    if (idx < 0) return;
    const deleted = anns[idx];
    anns.splice(idx, 1);
    setAnnotations(anns);
    onDelete?.({ type: "delete-annotation", annotation: deleted, index: idx });
    renderDrawLayer(getSvg(), getAnnotations(), ts.pageNumber);
  }

  function onPointerDown(e) {
    const tool = normalizeDrawTool(getToolState().tool);
    if (!isInteractTool(tool)) return;
    if (e.button !== 0) return;

    e.preventDefault();
    boundLayer?.setPointerCapture(e.pointerId);
    activePointerId = e.pointerId;

    if (isEraserTool(tool)) {
      erasing = { deletedIds: new Set() };
      tryEraseAt(e);
      return;
    }

    const [nx, ny] = normFromEvent(e);
    if (tool === TOOLS.underline) {
      drawing = { kind: "line", x1: nx, y1: ny, x2: nx, y2: ny, shift: e.shiftKey };
      return;
    }
    if (tool === TOOLS.highlighter) {
      drawing = { kind: "highlight", points: [[nx, ny]] };
      return;
    }
    if (tool === TOOLS.pen) {
      drawing = { kind: "pen", points: [[nx, ny]] };
    }
  }

  function onPointerMove(e) {
    if (activePointerId !== null && e.pointerId !== activePointerId) return;

    const tool = normalizeDrawTool(getToolState().tool);
    if (isEraserTool(tool) && erasing) {
      tryEraseAt(e);
      return;
    }

    if (!drawing) return;

    const [nx, ny] = normFromEvent(e);
    const ts = getToolState();

    if (drawing.kind === "line") {
      const snapped = snapLine(drawing.x1, drawing.y1, nx, ny, e.shiftKey || drawing.shift);
      drawing.x2 = snapped.x2;
      drawing.y2 = snapped.y2;
      let preview = getSvg()?.querySelector(".draw-preview");
      if (!preview) {
        preview = document.createElementNS("http://www.w3.org/2000/svg", "line");
        preview.classList.add("draw-preview");
        preview.setAttribute("stroke", LINE_COLORS[ts.lineColor] || LINE_COLORS.red);
        preview.setAttribute("stroke-width", LINE_THICKNESS);
        preview.setAttribute("vector-effect", "non-scaling-stroke");
        preview.setAttribute("stroke-linecap", "round");
        getSvg()?.appendChild(preview);
      }
      preview.setAttribute("x1", drawing.x1 * 100);
      preview.setAttribute("y1", drawing.y1 * 100);
      preview.setAttribute("x2", drawing.x2 * 100);
      preview.setAttribute("y2", drawing.y2 * 100);
      return;
    }

    const minDist = drawing.kind === "pen" ? 0.0015 : 0.003;
    const last = drawing.points[drawing.points.length - 1];
    if (!last || Math.hypot(last[0] - nx, last[1] - ny) > minDist) {
      drawing.points.push([nx, ny]);
    }

    const previewClass = drawing.kind === "pen" ? "draw-preview-pen" : "draw-preview-stroke";
    let preview = getSvg()?.querySelector(`.${previewClass}`);
    if (!preview) {
      preview = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
      preview.classList.add(previewClass);
      preview.setAttribute("fill", "none");
      preview.setAttribute("stroke-linecap", "round");
      preview.setAttribute("stroke-linejoin", "round");
      if (drawing.kind === "pen") {
        preview.setAttribute("stroke", PEN_COLORS[ts.penColor] || PEN_COLORS.red);
        preview.setAttribute("stroke-width", getPenWidthNorm(ts.penWidth) * 100);
        preview.setAttribute("opacity", "1");
      } else {
        preview.setAttribute("stroke", HIGHLIGHT_COLORS[ts.highlightColor] || HIGHLIGHT_COLORS.yellow);
        preview.setAttribute("stroke-width", clampHighlightWidth(HIGHLIGHT_WIDTH_NORM) * 100);
        preview.setAttribute("opacity", "0.85");
      }
      getSvg()?.appendChild(preview);
    }
    preview.setAttribute(
      "points",
      drawing.points.map(([x, y]) => `${x * 100},${y * 100}`).join(" ")
    );
  }

  function finishPointer(e) {
    if (activePointerId !== null && e.pointerId !== activePointerId) return;
    if (boundLayer && activePointerId !== null) {
      try {
        boundLayer.releasePointerCapture(activePointerId);
      } catch {
        /* ignore */
      }
    }
    activePointerId = null;

    if (erasing) {
      erasing = null;
      refresh();
      return;
    }

    if (!drawing) return;

    const ts = getToolState();
    const fp = ts.pdfFingerprint;
    const page = ts.pageNumber;
    const anns = [...getAnnotations()];

    getSvg()?.querySelectorAll(".draw-preview, .draw-preview-stroke, .draw-preview-pen").forEach((el) => el.remove());

    if (drawing.kind === "line") {
      const len = Math.hypot(drawing.x2 - drawing.x1, drawing.y2 - drawing.y1);
      if (len > 0.008) {
        const snapped = snapLine(drawing.x1, drawing.y1, drawing.x2, drawing.y2, drawing.shift);
        const newAnn = createLineAnnotation({
          pdfFingerprint: fp,
          pageNumber: page,
          ...snapped,
          color: ts.lineColor,
        });
        anns.push(newAnn);
        setAnnotations(anns);
        onChange?.({ type: "add", annotation: newAnn, index: anns.length - 1 });
      }
    } else if (drawing.kind === "highlight" && drawing.points.length > 1) {
      const newAnn = createStrokeAnnotation({
        pdfFingerprint: fp,
        pageNumber: page,
        points: drawing.points,
        color: ts.highlightColor,
        width: HIGHLIGHT_WIDTH_NORM,
      });
      anns.push(newAnn);
      setAnnotations(anns);
      onChange?.({ type: "add", annotation: newAnn, index: anns.length - 1 });
    } else if (drawing.kind === "pen" && drawing.points.length > 1) {
      const newAnn = createPenAnnotation({
        pdfFingerprint: fp,
        pageNumber: page,
        points: drawing.points,
        color: ts.penColor,
        width: ts.penWidth,
      });
      anns.push(newAnn);
      setAnnotations(anns);
      onChange?.({ type: "add", annotation: newAnn, index: anns.length - 1 });
    }

    drawing = null;
    refresh();
  }

  function preventDragStart(e) {
    if (isInteractTool(normalizeDrawTool(getToolState().tool))) e.preventDefault();
  }

  function bind(layerEl) {
    if (!layerEl) return;
    if (boundLayer === layerEl) {
      syncInteractLayer();
      return;
    }
    if (boundLayer) {
      boundLayer.removeEventListener("pointerdown", onPointerDown);
      boundLayer.removeEventListener("dragstart", preventDragStart);
    }
    boundLayer = layerEl;
    boundLayer.addEventListener("pointerdown", onPointerDown);
    boundLayer.addEventListener("dragstart", preventDragStart);
    getContainer()?.addEventListener("dragstart", preventDragStart);
    if (!windowBound) {
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", finishPointer);
      window.addEventListener("pointercancel", finishPointer);
      windowBound = true;
    }
    syncInteractLayer();
  }

  return {
    bind,
    refresh,
    cancelActive,
    syncInteractLayer,
  };
}
