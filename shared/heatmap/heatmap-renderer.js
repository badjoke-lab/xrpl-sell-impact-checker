export function syncCanvasSize(canvas, width, height) {
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const safeWidth = Math.max(1, Math.floor(width));
  const safeHeight = Math.max(1, Math.floor(height));
  canvas.width = Math.floor(safeWidth * dpr);
  canvas.height = Math.floor(safeHeight * dpr);
  canvas.style.width = `${safeWidth}px`;
  canvas.style.height = `${safeHeight}px`;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

export function drawTilesLayer(ctx, nodes, camera, options = {}) {
  clear(ctx, camera);
  const mode = options.mode || 'market';
  const hoveredId = options.hoveredId || null;
  const selectedId = options.selectedId || null;

  nodes.forEach((node) => {
    const box = toScreenRect(node, camera);
    if (box.width <= 0.5 || box.height <= 0.5) return;

    ctx.save();
    ctx.fillStyle = colorForNode(node, mode);
    ctx.strokeStyle = 'rgba(255,255,255,0.58)';
    ctx.lineWidth = selectedId === node.id || hoveredId === node.id ? 2 : 1;
    ctx.beginPath();
    ctx.roundRect(box.x + 0.5, box.y + 0.5, Math.max(0, box.width - 1), Math.max(0, box.height - 1), Math.min(12, Math.max(2, box.width * 0.04)));
    ctx.fill();
    ctx.stroke();
    drawLabel(ctx, node, box, mode);
    ctx.restore();
  });
}

export function drawOverlayLayer(ctx, nodes, camera, options = {}) {
  clear(ctx, camera);
  const selected = nodes.find((node) => node.id === options.selectedId);
  if (selected) drawOutline(ctx, selected, camera, 'rgba(255,255,255,0.96)', 3);
  const hovered = nodes.find((node) => node.id === options.hoveredId);
  if (hovered && hovered.id !== selected?.id) drawOutline(ctx, hovered, camera, 'rgba(255,255,255,0.68)', 2);
}

export function toScreenRect(node, camera) {
  const scale = camera.scale || 1;
  return {
    x: node.x * scale + camera.tx,
    y: node.y * scale + camera.ty,
    width: node.width * scale,
    height: node.height * scale,
  };
}

function drawOutline(ctx, node, camera, color, width) {
  const box = toScreenRect(node, camera);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.shadowColor = 'rgba(15,23,42,0.28)';
  ctx.shadowBlur = 10;
  ctx.strokeRect(box.x + 3, box.y + 3, Math.max(0, box.width - 6), Math.max(0, box.height - 6));
  ctx.restore();
}

function drawLabel(ctx, node, box, mode) {
  const profile = labelProfile(box);
  if (profile === 'tiny') return;

  const pad = Math.max(6, Math.min(14, Math.min(box.width, box.height) * 0.08));
  const x = box.x + pad;
  let y = box.y + pad + 12;
  const maxWidth = Math.max(0, box.width - pad * 2);

  ctx.fillStyle = 'rgba(255,255,255,0.94)';
  ctx.textBaseline = 'top';
  ctx.font = fontFor(profile, true);
  fillTrimmedText(ctx, node.shortLabel || node.label, x, y, maxWidth);

  if (profile === 'name_only') return;
  y += profile === 'featured' ? 22 : 18;
  ctx.font = fontFor(profile, false);
  ctx.fillStyle = 'rgba(255,255,255,0.86)';
  const primary = formatPrimary(node, mode);
  fillTrimmedText(ctx, primary, x, y, maxWidth);

  if (profile === 'compact') return;
  y += 18;
  const secondary = formatSecondary(node, mode);
  fillTrimmedText(ctx, secondary, x, y, maxWidth);
}

function labelProfile(box) {
  const area = box.width * box.height;
  const shortEdge = Math.min(box.width, box.height);
  if (area < 900 || shortEdge < 18) return 'tiny';
  if (area < 2500 || shortEdge < 32) return 'name_only';
  if (area < 7000 || shortEdge < 52) return 'compact';
  if (area < 18000) return 'standard';
  return 'featured';
}

function formatPrimary(node, mode) {
  if (mode === 'liquidity') return `${formatMoney(node.meta?.liquidity)} liq`;
  if (mode === 'exit') return exitLabel(node.meta?.exitCoverage);
  return `${formatMoney(node.meta?.marketCap)} mcap`;
}

function formatSecondary(node, mode) {
  if (mode === 'exit') return `${formatMoney(node.meta?.liquidity)} liq`;
  if (mode === 'liquidity') return `${formatPct(node.meta?.liquidityChange24h)} liq 24h`;
  return `${formatPct(node.meta?.priceChange24h)} 24h`;
}

function fontFor(profile, strong) {
  const weight = strong ? 800 : 650;
  if (profile === 'featured') return `${weight} 18px Inter, ui-sans-serif, system-ui, sans-serif`;
  if (profile === 'standard') return `${weight} 14px Inter, ui-sans-serif, system-ui, sans-serif`;
  return `${weight} 12px Inter, ui-sans-serif, system-ui, sans-serif`;
}

function fillTrimmedText(ctx, text, x, y, maxWidth) {
  const value = String(text || '—');
  if (ctx.measureText(value).width <= maxWidth) {
    ctx.fillText(value, x, y);
    return;
  }
  let next = value;
  while (next.length > 1 && ctx.measureText(`${next}…`).width > maxWidth) {
    next = next.slice(0, -1);
  }
  ctx.fillText(`${next}…`, x, y);
}

function colorForNode(node, mode) {
  if (mode === 'exit') {
    const value = String(node.meta?.exitCoverage || 'unknown');
    if (value === 'dual') return '#2f855a';
    if (value === 'book-only') return '#3b82f6';
    if (value === 'amm-only') return '#8b5cf6';
    if (value === 'none') return '#b91c1c';
    return '#64748b';
  }

  const raw = mode === 'liquidity' ? Number(node.meta?.liquidityChange24h) : Number(node.meta?.priceChange24h);
  if (!Number.isFinite(raw) || Math.abs(raw) < 0.1) return '#64748b';
  const strength = Math.min(1, Math.abs(raw) / 12);
  if (raw > 0) return mixColor([35, 101, 67], [21, 163, 92], strength);
  return mixColor([127, 29, 29], [220, 38, 38], strength);
}

function mixColor(a, b, t) {
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const bl = Math.round(a[2] + (b[2] - a[2]) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}

function clear(ctx, camera) {
  ctx.clearRect(0, 0, camera.viewportWidth, camera.viewportHeight);
}

function formatMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function formatPct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
}

function exitLabel(value) {
  if (value === 'dual') return 'Book + AMM';
  if (value === 'book-only') return 'Book only';
  if (value === 'amm-only') return 'AMM only';
  if (value === 'none') return 'No exit';
  return 'Unknown';
}
