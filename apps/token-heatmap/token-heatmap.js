import { mountHeatmap } from '/shared/heatmap/heatmap-engine.js';

const SNAPSHOT_VERSION = 1;

const MODES = {
  market: {
    label: 'Market Mode',
    area: 'estimated market cap',
    color: '24h price change',
  },
  liquidity: {
    label: 'Liquidity Mode',
    area: 'observed liquidity',
    color: 'liquidity change',
  },
  exit: {
    label: 'Exit Mode',
    area: 'observed liquidity',
    color: 'XRP exit coverage',
  },
};

const root = document.querySelector('[data-token-heatmap-root]');
const modeButtons = Array.from(document.querySelectorAll('[data-token-mode]'));
const countSelect = document.querySelector('[data-token-count]');
const resetButton = document.querySelector('[data-token-reset]');
const moveButton = document.querySelector('[data-token-move]');
const modeLabel = document.querySelector('[data-token-mode-label]');
const areaLabel = document.querySelector('[data-token-area-label]');
const colorLabel = document.querySelector('[data-token-color-label]');
const detailRoot = document.querySelector('[data-token-detail]');
const rankingRoot = document.querySelector('[data-token-ranking]');
const moveLabel = document.querySelector('[data-token-move-label]');
const sourceLabel = document.querySelector('[data-token-source]');
const countLabel = document.querySelector('[data-token-count-label]');
const updatedLabel = document.querySelector('[data-token-updated]');
const versionLabel = document.querySelector('[data-token-snapshot-version]');

let currentMode = 'market';
let moveMode = false;
let snapshot = createDemoSnapshot();
let tokens = snapshot.tokens;
let heatmap = null;
let selectedTokenId = null;

function normalizeForMode(mode) {
  return tokens.map((token) => ({
    id: tokenId(token),
    label: token.currency,
    shortLabel: token.currency,
    areaValue: mode === 'market' ? token.marketCap : token.liquidity,
    colorValue: mode === 'market' ? token.priceChange24h : mode === 'liquidity' ? token.liquidityChange24h : exitScore(token.exitCoverage),
    secondaryValue: mode === 'market' ? token.volume24h : token.liquidity,
    subtitle: shortIssuer(token.issuer),
    meta: token,
  }));
}

async function boot() {
  if (!root) return;
  snapshot = await loadSnapshot();
  tokens = snapshot.tokens;
  updateSnapshotStatus(snapshot);
  const items = normalizeForMode(currentMode);
  selectedTokenId = items[0]?.id || null;
  heatmap = mountHeatmap({
    root,
    items,
    selectedId: selectedTokenId,
    mode: currentMode,
    onSelect: updateDetail,
  });
  setMode(currentMode);
  updateRanking(items);
}

async function loadSnapshot() {
  const fallback = createDemoSnapshot();
  try {
    const response = await fetch('/apps/token-heatmap/token-heatmap-snapshot.demo.json', { cache: 'no-store' });
    if (!response.ok) return fallback;
    const parsed = await response.json();
    return normalizeSnapshot(parsed, fallback);
  } catch (_) {
    return fallback;
  }
}

function normalizeSnapshot(input, fallback) {
  if (!input || typeof input !== 'object') return fallback;
  const rawTokens = Array.isArray(input.tokens) ? input.tokens : [];
  const safeTokens = rawTokens.map(normalizeToken).filter(Boolean).slice(0, 100);
  if (!safeTokens.length) return fallback;
  return {
    snapshotVersion: Number(input.snapshotVersion) || SNAPSHOT_VERSION,
    generatedAt: input.generatedAt || 'demo',
    source: input.source || 'demo-json',
    status: input.status || 'demo',
    topLimit: Number(input.topLimit) || safeTokens.length,
    note: input.note || '',
    tokens: safeTokens,
  };
}

function normalizeToken(token) {
  if (!token || typeof token !== 'object') return null;
  const currency = String(token.currency || '').trim();
  const issuer = String(token.issuer || '').trim();
  if (!currency || !issuer) return null;
  const marketCap = toPositiveNumber(token.marketCap);
  const liquidity = toPositiveNumber(token.liquidity);
  const volume24h = toPositiveNumber(token.volume24h);
  if (!marketCap && !liquidity && !volume24h) return null;
  return {
    currency,
    issuer,
    marketCap,
    liquidity,
    volume24h,
    priceChange24h: toNumber(token.priceChange24h),
    liquidityChange24h: toNumber(token.liquidityChange24h),
    exitCoverage: normalizeExit(token.exitCoverage),
    updatedAt: token.updatedAt || 'demo',
  };
}

function setMode(mode) {
  currentMode = mode;
  const def = MODES[mode] || MODES.market;
  const items = normalizeForMode(mode);
  modeButtons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.tokenMode === mode)));
  if (modeLabel) modeLabel.textContent = def.label;
  if (areaLabel) areaLabel.textContent = `Area: ${def.area}`;
  if (colorLabel) colorLabel.textContent = `Color: ${def.color}`;
  heatmap?.setItems(items, { preserveCamera: true });
  heatmap?.setMode(mode);
  const selected = items.find((item) => item.id === selectedTokenId) || items[0];
  updateDetail(selected);
  updateRanking(items);
}

function updateSnapshotStatus(current) {
  if (sourceLabel) {
    sourceLabel.textContent = current.status === 'demo' ? 'Demo data' : `Source: ${current.source}`;
    sourceLabel.classList.toggle('token-chip--demo', current.status === 'demo');
  }
  if (countLabel) countLabel.textContent = `Showing top ${Math.min(current.topLimit || current.tokens.length, current.tokens.length)} XRPL tokens`;
  if (updatedLabel) updatedLabel.textContent = `Last updated: ${current.generatedAt || '—'}`;
  if (versionLabel) versionLabel.textContent = `snapshot v${current.snapshotVersion || SNAPSHOT_VERSION}`;
}

function updateDetail(node) {
  if (!detailRoot || !node) return;
  selectedTokenId = node.id || tokenId(node.meta || node);
  const token = node.meta || node;
  const sellImpact = `/apps/sell-impact/?currency=${encodeURIComponent(token.currency)}&issuer=${encodeURIComponent(token.issuer)}`;
  const routeCompare = `/apps/route-compare/?currency=${encodeURIComponent(token.currency)}&issuer=${encodeURIComponent(token.issuer)}`;
  const liquidityPulse = `/apps/liquidity-pulse/?currency=${encodeURIComponent(token.currency)}&issuer=${encodeURIComponent(token.issuer)}`;
  const exitCoverage = `/apps/exit-coverage-map/?issuer=${encodeURIComponent(token.issuer)}&currency=${encodeURIComponent(token.currency)}`;

  detailRoot.innerHTML = `
    <div class="token-detail-card__head">
      <p class="eyebrow">Selected token</p>
      <h2 class="token-detail-symbol">${escapeHtml(token.currency)}</h2>
      <p class="token-detail-subtitle">${escapeHtml(shortIssuer(token.issuer))} · ${escapeHtml(exitLabel(token.exitCoverage))}</p>
    </div>
    <dl class="token-metric-grid">
      <div class="token-metric"><dt>Market cap</dt><dd>${formatMoney(token.marketCap)}</dd></div>
      <div class="token-metric"><dt>Liquidity</dt><dd>${formatMoney(token.liquidity)}</dd></div>
      <div class="token-metric"><dt>24h volume</dt><dd>${formatMoney(token.volume24h)}</dd></div>
      <div class="token-metric"><dt>24h change</dt><dd>${formatPct(token.priceChange24h)}</dd></div>
      <div class="token-metric"><dt>Liquidity 24h</dt><dd>${formatPct(token.liquidityChange24h)}</dd></div>
      <div class="token-metric"><dt>Data status</dt><dd>${escapeHtml(snapshot.status || 'demo')}</dd></div>
    </dl>
    <div class="token-link-grid" aria-label="Token actions">
      <a class="primary-button" href="${sellImpact}">Estimate sell impact</a>
      <a class="secondary-button" href="${routeCompare}">Compare routes</a>
      <a class="secondary-button" href="${liquidityPulse}">Check liquidity</a>
      <a class="secondary-button" href="${exitCoverage}">Check exit coverage</a>
    </div>
  `;
}

function updateRanking(items) {
  if (!rankingRoot) return;
  const top = [...items].sort((a, b) => b.areaValue - a.areaValue).slice(0, 12);
  rankingRoot.innerHTML = top.map((item, index) => `
    <li>
      <span class="token-rank-index">#${index + 1}</span>
      <span class="token-rank-name">${escapeHtml(item.label)}</span>
      <span class="token-rank-value">${formatRankValue(item)}</span>
    </li>
  `).join('');
}

function formatRankValue(item) {
  if (currentMode === 'market') return formatMoney(item.meta?.marketCap);
  if (currentMode === 'liquidity') return formatMoney(item.meta?.liquidity);
  return exitLabel(item.meta?.exitCoverage);
}

modeButtons.forEach((button) => button.addEventListener('click', () => setMode(button.dataset.tokenMode)));
resetButton?.addEventListener('click', () => heatmap?.resetZoom());
moveButton?.addEventListener('click', () => {
  moveMode = !moveMode;
  heatmap?.setMoveMode(moveMode);
  if (moveButton) moveButton.textContent = moveMode ? 'Back to scroll' : 'Control map';
  if (moveLabel) moveLabel.textContent = moveMode ? 'Pan & pinch' : 'Page scroll';
});
countSelect?.addEventListener('change', () => {
  countSelect.value = '100';
});

boot();

function createDemoSnapshot() {
  return {
    snapshotVersion: SNAPSHOT_VERSION,
    generatedAt: 'demo',
    source: 'inline-demo',
    status: 'demo',
    topLimit: 100,
    note: 'Synthetic data for layout and interaction preview only.',
    tokens: makeDemoTokens(100),
  };
}

function makeDemoTokens(count) {
  const symbols = ['XRPX','RLUSD','SOLO','CORE','CSC','ELS','XAH','VGB','BTCX','ETHX','USD','EUR','JPY','GOLD','SILV','ARMY','PHNIX','RPR','XRdoge','CNY','AUD','CAD','MXN','BRL','SGD','CHF','GBP','NZD','KRW','INR'];
  const exits = ['dual', 'book-only', 'amm-only', 'none'];
  return Array.from({ length: count }, (_, index) => {
    const rank = index + 1;
    const symbol = symbols[index % symbols.length] + (index >= symbols.length ? String(Math.floor(index / symbols.length) + 1) : '');
    const marketCap = Math.max(350000, 220000000 / Math.pow(rank, 0.82));
    const liquidity = Math.max(45000, 28000000 / Math.pow(rank, 0.72));
    const volume24h = Math.max(9000, 12000000 / Math.pow(rank, 0.78));
    const wave = Math.sin(rank * 1.73);
    const priceChange24h = Number((wave * 11.5 + Math.cos(rank * 0.41) * 3).toFixed(2));
    const liquidityChange24h = Number((Math.cos(rank * 1.17) * 8.5).toFixed(2));
    return {
      currency: symbol,
      issuer: demoIssuer(index),
      marketCap,
      liquidity,
      volume24h,
      priceChange24h,
      liquidityChange24h,
      exitCoverage: exits[index % exits.length],
      updatedAt: 'demo',
    };
  });
}

function tokenId(token) {
  return `${token.currency}.${token.issuer}`;
}

function demoIssuer(index) {
  const seed = String(index + 1).padStart(2, '0');
  return `rDemoIssuer${seed}xxxxxxxxxxxxxxxxxxxxxxxx`;
}

function shortIssuer(value) {
  const text = String(value || 'unknown');
  if (text.length <= 16) return text;
  return `${text.slice(0, 8)}…${text.slice(-6)}`;
}

function normalizeExit(value) {
  if (value === 'dual' || value === 'book-only' || value === 'amm-only' || value === 'none') return value;
  return 'unknown';
}

function exitScore(value) {
  if (value === 'dual') return 3;
  if (value === 'book-only') return 2;
  if (value === 'amm-only') return 1;
  if (value === 'none') return -1;
  return 0;
}

function exitLabel(value) {
  if (value === 'dual') return 'Book + AMM';
  if (value === 'book-only') return 'Book only';
  if (value === 'amm-only') return 'AMM only';
  if (value === 'none') return 'No XRP exit observed';
  return 'Unknown';
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toPositiveNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
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

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
}
