import { panCamera, screenToWorld, zoomBy, zoomCameraAroundScreenPoint } from './heatmap-camera.js';

const PAN_THRESHOLD = 6;

export function bindHeatmapInteractions({ viewport, state, redraw, onSelect, onHover }) {
  const pointerMap = new Map();
  let downPoint = null;
  let lastPoint = null;
  let dragging = false;
  let pinchStart = null;

  viewport.addEventListener('wheel', (event) => {
    if (!event.ctrlKey && !event.altKey && !event.metaKey) return;
    event.preventDefault();
    const local = localPoint(event, viewport);
    const factor = event.deltaY < 0 ? 1.14 : 0.88;
    state.camera = zoomBy(state.camera, local, factor);
    redraw();
  }, { passive: false });

  viewport.addEventListener('dblclick', (event) => {
    event.preventDefault();
    const local = localPoint(event, viewport);
    const factor = event.shiftKey ? 0.72 : 1.55;
    state.camera = zoomBy(state.camera, local, factor);
    redraw();
  });

  viewport.addEventListener('pointerdown', (event) => {
    const point = localPoint(event, viewport);

    if (event.pointerType === 'touch' && !state.moveMode) {
      downPoint = point;
      lastPoint = point;
      dragging = false;
      return;
    }

    viewport.setPointerCapture?.(event.pointerId);
    pointerMap.set(event.pointerId, point);
    downPoint = point;
    lastPoint = point;
    dragging = false;

    if (pointerMap.size === 2) {
      const points = Array.from(pointerMap.values());
      pinchStart = {
        distance: distance(points[0], points[1]),
        zoom: state.camera.zoom,
      };
    }
  });

  viewport.addEventListener('pointermove', (event) => {
    const point = localPoint(event, viewport);

    if (!downPoint) {
      const hovered = pickNode(point, state);
      state.hoveredId = hovered?.id || null;
      onHover?.(hovered);
      redraw();
      return;
    }

    if (event.pointerType === 'touch' && !state.moveMode) return;
    if (pointerMap.has(event.pointerId)) pointerMap.set(event.pointerId, point);

    if (state.moveMode && pointerMap.size === 2 && pinchStart) {
      const points = Array.from(pointerMap.values());
      const currentDistance = Math.max(1, distance(points[0], points[1]));
      const center = midpoint(points[0], points[1]);
      const nextZoom = pinchStart.zoom * (currentDistance / Math.max(1, pinchStart.distance));
      state.camera = zoomCameraAroundScreenPoint(state.camera, center, nextZoom);
      redraw();
      return;
    }

    const moved = distance(downPoint, point);
    if (!dragging && moved >= PAN_THRESHOLD) dragging = true;
    if (dragging && lastPoint) {
      state.camera = panCamera(state.camera, point.x - lastPoint.x, point.y - lastPoint.y);
      redraw();
    }
    lastPoint = point;
  });

  const finishPointer = (event) => {
    const point = localPoint(event, viewport);
    if (pointerMap.has(event.pointerId)) pointerMap.delete(event.pointerId);
    if (pointerMap.size < 2) pinchStart = null;

    if (downPoint && !dragging) {
      const node = pickNode(point, state);
      if (node) {
        state.selectedId = node.id;
        onSelect?.(node);
      }
    }

    if (!pointerMap.size) {
      downPoint = null;
      lastPoint = null;
      dragging = false;
    }
    redraw();
  };

  viewport.addEventListener('pointerup', finishPointer);
  viewport.addEventListener('pointercancel', finishPointer);
  viewport.addEventListener('pointerleave', () => {
    if (!downPoint) {
      state.hoveredId = null;
      redraw();
    }
  });
}

function pickNode(point, state) {
  const world = screenToWorld(point, state.camera);
  for (let i = state.nodes.length - 1; i >= 0; i -= 1) {
    const node = state.nodes[i];
    if (
      world.x >= node.x &&
      world.x <= node.x + node.width &&
      world.y >= node.y &&
      world.y <= node.y + node.height
    ) {
      return node;
    }
  }
  return null;
}

function localPoint(event, element) {
  const rect = element.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(a, b) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  };
}
