import { createFitCamera, updateViewport } from './heatmap-camera.js';
import { bindHeatmapInteractions } from './heatmap-interactions.js';
import { drawOverlayLayer, drawTilesLayer, syncCanvasSize } from './heatmap-renderer.js';
import { buildSceneNodes } from './heatmap-treemap.js';

export function mountHeatmap(input) {
  const root = input.root;
  if (!root) throw new Error('mountHeatmap requires root');

  root.classList.add('heatmap-engine-root');
  root.innerHTML = `
    <div class="heatmap-canvas-viewport" data-heatmap-viewport>
      <canvas class="heatmap-canvas heatmap-canvas--tiles" data-heatmap-tiles></canvas>
      <canvas class="heatmap-canvas heatmap-canvas--overlay" data-heatmap-overlay></canvas>
    </div>
  `;

  const viewport = root.querySelector('[data-heatmap-viewport]');
  const tilesCanvas = root.querySelector('[data-heatmap-tiles]');
  const overlayCanvas = root.querySelector('[data-heatmap-overlay]');

  const state = {
    items: normalizeItems(input.items || []),
    nodes: [],
    camera: createFitCamera(1, 1),
    selectedId: input.selectedId || null,
    hoveredId: null,
    mode: input.mode || 'market',
    moveMode: false,
    tileCtx: null,
    overlayCtx: null,
  };

  const redraw = () => {
    if (!state.tileCtx || !state.overlayCtx) return;
    drawTilesLayer(state.tileCtx, state.nodes, state.camera, {
      mode: state.mode,
      selectedId: state.selectedId,
      hoveredId: state.hoveredId,
    });
    drawOverlayLayer(state.overlayCtx, state.nodes, state.camera, {
      selectedId: state.selectedId,
      hoveredId: state.hoveredId,
    });
  };

  const relayout = () => {
    const rect = viewport.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    state.camera = updateViewport(state.camera, width, height);
    state.nodes = buildSceneNodes(state.items, width, height);
    state.tileCtx = syncCanvasSize(tilesCanvas, width, height);
    state.overlayCtx = syncCanvasSize(overlayCanvas, width, height);
    if (!state.selectedId && state.nodes[0]) {
      state.selectedId = state.nodes[0].id;
      input.onSelect?.(state.nodes[0]);
    }
    redraw();
  };

  bindHeatmapInteractions({
    viewport,
    state,
    redraw,
    onSelect: input.onSelect,
    onHover: input.onHover,
  });

  let resizeFrame = 0;
  const resizeObserver = new ResizeObserver(() => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(relayout);
  });
  resizeObserver.observe(viewport);

  relayout();

  return {
    setItems(items) {
      state.items = normalizeItems(items || []);
      relayout();
    },
    setMode(mode) {
      state.mode = mode || 'market';
      redraw();
    },
    setMoveMode(enabled) {
      state.moveMode = Boolean(enabled);
      viewport.classList.toggle('is-move-mode', state.moveMode);
    },
    resetZoom() {
      const rect = viewport.getBoundingClientRect();
      state.camera = createFitCamera(rect.width, rect.height);
      redraw();
    },
    destroy() {
      resizeObserver.disconnect();
      cancelAnimationFrame(resizeFrame);
      root.innerHTML = '';
    },
  };
}

function normalizeItems(items) {
  return items
    .map((item) => ({
      ...item,
      id: String(item.id || item.label || Math.random()),
      label: String(item.label || item.id || 'Unknown'),
      shortLabel: item.shortLabel ? String(item.shortLabel) : undefined,
      areaValue: Number.isFinite(Number(item.areaValue)) ? Math.max(0, Number(item.areaValue)) : 0,
      colorValue: Number.isFinite(Number(item.colorValue)) ? Number(item.colorValue) : 0,
      secondaryValue: Number.isFinite(Number(item.secondaryValue)) ? Number(item.secondaryValue) : null,
      meta: item.meta || {},
    }))
    .filter((item) => item.areaValue > 0);
}
