(() => {
  const OVERALL_ID = 'egOverallSummary';

  function apply() {
    const helpItems = document.querySelectorAll('.eg-help-card li');
    if (helpItems[2]) {
      helpItems[2].textContent = 'The combined band is a transparent heuristic from bounded concentration thresholds and observed account-control flags. It is not a safety, solvency, credit, or institutional-readiness rating.';
    }

    const overall = document.getElementById(OVERALL_ID);
    if (overall) {
      const eyebrow = overall.querySelector('.eyebrow');
      const title = overall.querySelector('.eg-section-title');
      const chip = overall.querySelector('.eg-status-chip');
      if (eyebrow) eyebrow.textContent = 'Heuristic summary';
      if (title) title.textContent = 'Combined concentration and control context';
      if (chip) {
        chip.setAttribute('aria-label', `Heuristic band ${chip.textContent || 'unknown'}`);
        chip.title = 'Heuristic band only; not a safety or readiness rating.';
      }
      const paragraphs = [...overall.querySelectorAll('.eg-overall-foot .eg-meta')];
      const method = paragraphs.find((node) => /^Method:/i.test(node.textContent || ''));
      if (method) {
        method.textContent = 'Method: bounded concentration thresholds plus observed issuer-control flags. The two dimensions use different units and are shown as context, not as a validated risk score.';
      }
    }

    document.querySelectorAll('.eg-evidence-item strong').forEach((node) => {
      if ((node.textContent || '').trim() === 'Freeze') node.textContent = 'Freeze capability';
    });
  }

  const target = document.querySelector('.exposure-graph-page') || document.body;
  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      apply();
    });
  });
  observer.observe(target, { childList: true, subtree: true });
  apply();
})();
