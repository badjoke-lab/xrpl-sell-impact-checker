(() => {
  const body = document.body;
  const nav = document.getElementById('global-nav');
  const toggle = document.querySelector('.nav-toggle');
  if (nav && toggle) {
    toggle.addEventListener('click', () => {
      const open = nav.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(open));
    });
  }
  const activeKey = body?.dataset.navKey;
  if (!activeKey) return;
  document.querySelectorAll('[data-nav-item]').forEach((link) => {
    if (link.getAttribute('data-nav-item') === activeKey) {
      link.classList.add('is-active');
      link.setAttribute('aria-current', 'page');
    }
  });
})();
