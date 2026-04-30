export function createFitCamera(viewportWidth, viewportHeight) {
  return {
    zoom: 1,
    scale: 1,
    tx: 0,
    ty: 0,
    viewportWidth: Math.max(1, Number(viewportWidth) || 1),
    viewportHeight: Math.max(1, Number(viewportHeight) || 1),
  };
}

export function screenToWorld(point, camera) {
  const scale = camera.scale || 1;
  return {
    x: (point.x - camera.tx) / scale,
    y: (point.y - camera.ty) / scale,
  };
}

export function panCamera(camera, dx, dy) {
  return clampCamera({
    ...camera,
    tx: camera.tx + dx,
    ty: camera.ty + dy,
  });
}

export function zoomCameraAroundScreenPoint(camera, screenPoint, nextZoom) {
  const zoom = clamp(Number(nextZoom) || 1, 0.7, 6);
  const anchorWorld = screenToWorld(screenPoint, camera);
  const scale = zoom;
  return clampCamera({
    ...camera,
    zoom,
    scale,
    tx: screenPoint.x - anchorWorld.x * scale,
    ty: screenPoint.y - anchorWorld.y * scale,
  });
}

export function zoomBy(camera, screenPoint, factor) {
  const safeFactor = Number.isFinite(factor) ? factor : 1;
  return zoomCameraAroundScreenPoint(camera, screenPoint, camera.zoom * safeFactor);
}

export function updateViewport(camera, viewportWidth, viewportHeight) {
  return {
    ...createFitCamera(viewportWidth, viewportHeight),
    zoom: 1,
    scale: 1,
  };
}

function clampCamera(camera) {
  const maxPanX = Math.max(120, camera.viewportWidth * 1.5);
  const maxPanY = Math.max(120, camera.viewportHeight * 1.5);
  return {
    ...camera,
    tx: clamp(camera.tx, -maxPanX, maxPanX),
    ty: clamp(camera.ty, -maxPanY, maxPanY),
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
