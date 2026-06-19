(() => {
  void import('/shared/usage-metrics.js');

  const main = document.querySelector('main');
  if (main && !main.id) main.id = 'main-content';

  if (main && !document.querySelector('.skip-link')) {
    const link = document.createElement('a');
    link.className = 'skip-link';
    link.href = `#${main.id}`;
    link.textContent = 'Skip to main content';
    document.body.prepend(link);
  }

  if (!document.getElementById('xsic-accessibility-styles')) {
    const link = document.createElement('link');
    link.id = 'xsic-accessibility-styles';
    link.rel = 'stylesheet';
    link.href = '/shared/accessibility.css';
    document.head.appendChild(link);
  }

  document.querySelectorAll('table').forEach((table) => {
    if (table.parentElement?.classList.contains('table-scroll-region')) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'table-scroll-region';
    wrapper.tabIndex = 0;
    wrapper.setAttribute('role', 'region');
    wrapper.setAttribute('aria-label', table.getAttribute('aria-label') || 'Scrollable data table');
    table.parentNode?.insertBefore(wrapper, table);
    wrapper.appendChild(table);
  });

  document.querySelectorAll('button:not([type])').forEach((button) => button.setAttribute('type', 'button'));
  document.querySelectorAll('a[target="_blank"]').forEach((link) => {
    const rel = new Set(String(link.getAttribute('rel') || '').split(/\s+/).filter(Boolean));
    rel.add('noopener');
    link.setAttribute('rel', [...rel].join(' '));
  });
})();
