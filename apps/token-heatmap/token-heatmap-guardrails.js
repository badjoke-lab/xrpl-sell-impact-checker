(() => {
  function apply() {
    const exitButton = document.querySelector('[data-token-mode="exit"]');
    if (exitButton) {
      exitButton.disabled = true;
      exitButton.setAttribute('aria-disabled', 'true');
      exitButton.title = 'Exit-route checks are not connected to this token snapshot yet.';
      if (exitButton.getAttribute('aria-pressed') === 'true') {
        document.querySelector('[data-token-mode="market"]')?.click();
      }
    }

    const hero = document.querySelector('.token-heatmap-hero .page-subtitle');
    if (hero) {
      hero.textContent = 'Explore source-labelled market and liquidity snapshots. Exit-route coloring stays disabled until token-by-token XSIC coverage checks are connected.';
    }

    const colorLabel = document.querySelector('[data-token-color-label]');
    if (colorLabel && /route/i.test(colorLabel.textContent || '')) {
      colorLabel.textContent = 'Color: exit-route data unavailable';
    }

    const guideItems = document.querySelectorAll('.token-info-grid article:first-child li');
    if (guideItems[2]) guideItems[2].textContent = 'Exit Mode: unavailable until per-token route checks are connected.';
    const legendTitle = document.querySelector('.token-info-grid article:nth-child(2) .section-title');
    if (legendTitle) legendTitle.textContent = 'Exit route data is not connected';
  }

  const target = document.querySelector('.token-heatmap-page') || document.body;
  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      apply();
    });
  });
  observer.observe(target, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-pressed'] });
  apply();
})();
