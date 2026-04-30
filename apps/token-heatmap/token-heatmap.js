import { mountHeatmap } from '/shared/heatmap/heatmap-engine.js';

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

let currentMode = 'market';
let moveMode = false;
const demoTokens = makeDemoTokens(100);
let heatmap = null;

function normalizeForMode(mode) {
  return demoTokens.map((token) => ({
    id: `${token.currency}.${token.issuer}`,
    label: token.currency,
    shortLabel: token.currency,
    areaValue: mode === 'market' ? token.marketCap : token.liquidity,
    colorValue: mode === 'market' ? token.priceChange24h : mode === 'liquidity' ? token.liquidityChange24h : exitScore(token.exitCoverage),
    secondaryValue: mode === 'market' ? token.volume24h : token.liquidity,
    subtitle: shortIssuer(token.issuer),
    meta: token,
  }));
}

function boot() {
  if (!root) return;
  const items = normalizeForMode(currentMode);
  heatmap = mountHeatmap({
    root,
    items,
    mode: currentMode,
    onSelect: updateDetail,
  });
  setMode(currentMode);
  updateDetail(items[0]);
  updateRanking(items);
}

function setMode(mode) {
  currentMode = mode;
  const def = MODES[mode] || MODES.market;
  const items = normalizeForMode(mode);
  modeButtons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.tokenMode === mode)));
  if (modeLabel) modeLabel.textContent = def.label;
  if (areaLabel) areaLabel.textContent = `Area: ${def.area}`;
  if (colorLabel) colorLabel.textContent = `Color: ${def.color}`;
  heatmap?.setItems(items);
  heatmap?.setMode(mode);
  updateDetail(items[0]);
  updateRanking(items);
}

function updateDetail(node) {
  if (!detailRoot || !node) return;
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
      <div class="token-metric"><dt>Data status</dt><dd>Demo</dd></div>
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

function demoIssuer(index) {
  const seed = String(index + 1).padStart(2, '0');
  return `rDemoIssuer${seed}xxxxxxxxxxxxxxxxxxxxxxxx`;
}

function shortIssuer(value) {
  const text = String(value || 'unknown');
  if (text.length <= 16) return text;
  return `${text.slice(0, 8)}…${text.slice(-6)}`;
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
