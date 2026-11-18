// LiteBlock popup/popunder shield (MAIN world, every frame).
// Idle cost: zero. Nothing runs unless the page opens a window, clicks a link
// programmatically, or the user clicks. No timers, no observers, no DOM scans.
(() => {
  'use strict';
  if (window.__liteblock) return;
  Object.defineProperty(window, '__liteblock', { value: 1 });

  const root = document.documentElement;
  const off = () => root.hasAttribute('data-lb-off'); // set by site.js on paused sites

  // Cross-origin popups that are normal: sign-in and share flows.
  const OK_HOSTS = /(^|\.)(accounts\.google\.com|login\.microsoftonline\.com|login\.live\.com|appleid\.apple\.com|github\.com|facebook\.com|twitter\.com|x\.com|linkedin\.com|discord\.com|paypal\.com|stripe\.com|checkout\.stripe\.com|auth0\.com|okta\.com|pinterest\.com|reddit\.com|t\.me|telegram\.org|wa\.me|whatsapp\.com|line\.me|mail\.google\.com|outlook\.live\.com|zoom\.us|slack\.com|esewa\.com\.np|khalti\.com|connectips\.com)$/i;

  const site = h => h.split('.').slice(-2).join('.');
  const here = site(location.hostname);
  const sameSite = h => site(h) === here;

  let lastClick = null; // { interactive: bool }

  const report = url => {
    try { document.dispatchEvent(new CustomEvent('__lb_blocked', { detail: String(url).slice(0, 300) })); } catch (_) {}
  };

  function parse(u) {
    try { return new URL(u || 'about:blank', location.href); } catch (_) { return null; }
  }

  // Should this navigation-to-a-new-window be allowed?
  function allowOpen(u) {
    if (off()) return true;
    if (!(navigator.userActivation && navigator.userActivation.isActive)) return false; // no real click -> popup ad
    const url = parse(u);
    if (!url) return false;
    if (url.href === 'about:blank') return !!(lastClick && lastClick.interactive); // open-blank-then-redirect trick
    if (url.protocol === 'blob:' || url.protocol === 'data:') return true;
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    return sameSite(url.hostname) || OK_HOSTS.test(url.hostname);
  }

  // ---- window.open ----------------------------------------------------------
  const realOpen = window.open;
  const stub = () => new Proxy(function () {}, {
    get: (_, k) => (k === 'closed' ? false : k === Symbol.toPrimitive ? () => '' : stub()),
    apply: () => stub(),
    set: () => true
  });
  window.open = new Proxy(realOpen, {
    apply(target, self, args) {
      if (allowOpen(args[0])) return Reflect.apply(target, self, args);
      report(args[0] || 'about:blank');
      // Pretend it worked so scripts do not fall back to hijacking this tab.
      return stub();
    }
  });

  // ---- clicks ---------------------------------------------------------------
  const INTERACTIVE = 'a[href],button,input,select,summary,[role="button"],[role="link"],[onclick]';

  function isHijackOverlay(el) {
    // Invisible / full-page element sitting on top of the page to steal clicks.
    try {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const cover = (r.width * r.height) / Math.max(1, innerWidth * innerHeight);
      const floating = cs.position === 'fixed' || cs.position === 'absolute';
      const invisible = parseFloat(cs.opacity) < 0.05 || cs.visibility === 'hidden' || cs.backgroundColor === 'rgba(0, 0, 0, 0)';
      const empty = !el.textContent.trim() && !el.querySelector('img,video,svg,canvas,input,button');
      return floating && cover > 0.5 && (invisible || empty);
    } catch (_) { return false; }
  }

  addEventListener('click', e => {
    if (off()) return;
    const t = e.target instanceof Element ? e.target : null;
    const a = t && t.closest ? t.closest('a[href]') : null;

    if (!e.isTrusted) {
      // Script-made click on a link: the classic "create <a target=_blank>, .click()" popup.
      if (a && a.target && a.target !== '_self') {
        const u = parse(a.href);
        if (u && (u.protocol === 'http:' || u.protocol === 'https:') && !sameSite(u.hostname) && !OK_HOSTS.test(u.hostname)) {
          e.preventDefault(); e.stopImmediatePropagation(); report(a.href);
        }
      }
      return;
    }

    lastClick = { interactive: !!(t && t.closest && t.closest(INTERACTIVE) && !isHijackOverlay(t)) };

    // Real click, but on an invisible click-catching overlay that links out.
    if (a && a.target && a.target !== '_self' && isHijackOverlay(a)) {
      e.preventDefault(); e.stopImmediatePropagation(); report(a.href);
    }
  }, true);

  // ---- hidden forms that submit into a new tab -------------------------------
  const realSubmit = HTMLFormElement.prototype.submit;
  HTMLFormElement.prototype.submit = new Proxy(realSubmit, {
    apply(target, self, args) {
      if (!off() && self.target && self.target !== '_self') {
        const u = parse(self.action);
        if (u && !sameSite(u.hostname) && !OK_HOSTS.test(u.hostname) && !(navigator.userActivation && navigator.userActivation.isActive)) {
          report(self.action); return;
        }
      }
      return Reflect.apply(target, self, args);
    }
  });
})();
