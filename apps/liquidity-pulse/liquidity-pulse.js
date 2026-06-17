import('/apps/liquidity-pulse/liquidity-pulse-runtime.js').catch(() => {
  const status = document.getElementById('lpStatus');
  if (status) status.textContent = 'Status: Liquidity Pulse failed to initialize.';
});
