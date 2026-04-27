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

  const ensureSupportStyles = () => {
    if (document.getElementById('xsic-support-style')) return;
    const style = document.createElement('style');
    style.id = 'xsic-support-style';
    style.textContent = `
      .site-nav a.site-nav__support {
        border: 1px solid rgba(111, 99, 194, 0.24);
        border-radius: 999px;
        padding: 7px 12px;
        color: var(--color-primary-ink, #4c4198);
        background: rgba(111, 99, 194, 0.08);
      }
      .site-nav a.site-nav__support::before {
        content: "♡ ";
      }
      .site-nav a.site-nav__support:hover {
        color: var(--color-primary-strong, #5d52b7);
        border-color: rgba(111, 99, 194, 0.36);
        background: rgba(111, 99, 194, 0.12);
      }
      .app-support-card {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: center;
        gap: 16px;
        margin-top: 4px;
      }
      .app-support-card__copy {
        display: grid;
        gap: 8px;
      }
      .app-support-card__title {
        margin: 0;
        font-size: 1.15rem;
      }
      .app-support-card__text {
        margin: 0;
        color: #475569;
        line-height: 1.6;
      }
      .app-support-card__button {
        width: auto;
        min-width: 160px;
        text-align: center;
        text-decoration: none;
      }
      @media (max-width: 700px) {
        .app-support-card {
          grid-template-columns: 1fr !important;
        }
        .app-support-card__button {
          width: 100% !important;
        }
      }
    `;
    document.head.appendChild(style);
  };

  ensureSupportStyles();

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
      supportCard.innerHTML = `
        <div class="app-support-card__copy">
          <p class="eyebrow" style="margin:0;">Support</p>
          <h2 id="app-support-title" class="app-support-card__title">Keep XSIC running</h2>
          <p class="app-support-card__text">If this tool helps your XRPL research or execution checks, consider supporting XSIC. Donations help cover infrastructure, refresh jobs, monitoring, and maintenance.</p>
        </div>
        <a class="primary-button app-support-card__button" href="/donate/">Support XSIC</a>`;
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
