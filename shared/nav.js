(function () {
  const LINKS = [
    { key: 'console', label: 'Console', href: '/' },
    { key: 'apps', label: 'Apps', href: '/apps/' },
    { key: 'docs', label: 'Docs', href: '/methods/' },
    { key: 'donate', label: 'Donate', href: '/donate/' },
    {
      key: 'contact',
      label: 'Contact',
      href: 'https://docs.google.com/forms/d/e/1FAIpQLScdv3WFVHmQO_mz-p4_HJv1RyJItghrG6A0SGQ5ec4R2NBNOw/viewform?usp=pp_url&entry.148248220=XSIC',
      target: '_blank',
    },
  ];

  const activeKey = document.body?.dataset.navKey;
  const navMount = document.querySelector('[data-global-nav]');
  const toggle = document.querySelector('.nav-toggle');

  if (navMount) {
    const nav = document.createElement('nav');
    nav.className = 'site-nav global-nav';
    nav.id = 'global-nav';
    nav.setAttribute('aria-label', 'Primary');

    LINKS.forEach((item) => {
      const link = document.createElement('a');
      link.href = item.href;
      link.textContent = item.label;
      link.dataset.navItem = item.key;
      if (item.target) {
        link.target = item.target;
        link.rel = 'noopener';
      }
      if (activeKey && activeKey === item.key) {
        link.classList.add('is-active');
        link.setAttribute('aria-current', 'page');
      }
      nav.appendChild(link);
    });

    navMount.replaceWith(nav);

    if (toggle) {
      toggle.setAttribute('aria-controls', 'global-nav');
      toggle.addEventListener('click', () => {
        const open = nav.classList.toggle('is-open');
        toggle.setAttribute('aria-expanded', String(open));
      });
    }
  }

  const footerMount = document.querySelector('[data-global-footer]');
  if (footerMount) {
    footerMount.innerHTML = `
      <footer class="site-footer">
        <div class="site-footer__brand">
          <a class="site-footer__title" href="https://badjoke-lab.com/" target="_blank" rel="noopener">Badjoke-lab</a>
          <p class="site-footer__note">XSIC · XRPL Signal & Insight Console</p>
        </div>
        <nav class="site-footer__links" aria-label="Footer">
          <a href="/methods/">Methods</a>
          <a href="/faq/">FAQ</a>
          <a href="/disclaimer/">Disclaimer</a>
          <a href="/credits/">Credits</a>
          <a href="/donate/">Donate</a>
        </nav>
      </footer>`;
  }

  const liteToggle = document.querySelector('[data-lite-mode-toggle]');
  if (liteToggle && window.XSICUiKit) {
    const renderToggle = () => {
      const on = window.XSICUiKit.getLiteMode();
      liteToggle.textContent = on ? 'Lite mode: ON' : 'Lite mode: OFF';
      liteToggle.setAttribute('aria-pressed', String(on));
    };

    liteToggle.addEventListener('click', () => {
      const next = !window.XSICUiKit.getLiteMode();
      window.XSICUiKit.setLiteMode(next);
      renderToggle();
    });

    window.addEventListener('xsic:lite-mode-change', renderToggle);
    renderToggle();
  }
})();
