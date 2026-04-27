(function () {
  const LINKS = [
    { key: 'home', label: 'Home', href: '/' },
    { key: 'apps', label: 'Apps', href: '/apps/' },
    { key: 'docs', label: 'Docs', href: '/methods/' },
    { key: 'donate', label: 'Donate', href: '/donate/' },
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
      if (item.key === 'donate') {
        link.classList.add('site-nav__support');
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
    const path = window.location.pathname;
    const isToolPage = /^\/apps\/[^/]+\/?$/.test(path);

    if (isToolPage && !document.querySelector('[data-app-support-card]')) {
      const supportCard = document.createElement('section');
      supportCard.className = 'card app-support-card';
      supportCard.dataset.appSupportCard = 'true';
      supportCard.setAttribute('aria-labelledby', 'app-support-title');
      supportCard.style.cssText = 'display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:16px;margin-top:4px;';
      supportCard.innerHTML = `
        <div style="display:grid;gap:8px;">
          <p class="eyebrow" style="margin:0;">Support</p>
          <h2 id="app-support-title" style="margin:0;font-size:1.15rem;">Keep XSIC running</h2>
          <p style="margin:0;color:#475569;line-height:1.6;">If this tool helps your XRPL research or execution checks, consider supporting XSIC. Donations help cover infrastructure, refresh jobs, monitoring, and maintenance.</p>
        </div>
        <a class="primary-button" href="/donate/" style="width:auto;min-width:160px;text-align:center;text-decoration:none;">Support XSIC</a>`;
      footerMount.parentNode?.insertBefore(supportCard, footerMount);
    }

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
})();
