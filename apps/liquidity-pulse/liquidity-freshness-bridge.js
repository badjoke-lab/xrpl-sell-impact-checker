window.addEventListener('xsic:liquidity-rendered', (event) => {
  const detail = event.detail || {};
  document.documentElement.dataset.liquidityHistoryState = detail.historyFreshness?.state || 'missing';
});
