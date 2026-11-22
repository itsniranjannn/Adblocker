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
  const OK_HOSTS = /(^|\.)(accounts\.google\.com|login\.microsoftonline\.com|login\.live\.com|appleid\.apple\.com|github\.com|facebook\.com|twitter\.com|x\.com|instagram\.com|linkedin\.com|discord\.com|paypal\.com|stripe\.com|checkout\.stripe\.com|auth0\.com|okta\.com|pinterest\.com|reddit\.com|t\.me|telegram\.org|wa\.me|whatsapp\.com|line\.me|mail\.google\.com|outlook\.live\.com|zoom\.us|slack\.com|esewa\.com\.np|khalti\.com|connectips\.com)$/i;

  // Obvious ad network domains & tracking redirect keywords
  const AD_HOST_OR_URL = /(clickunder|popunder|popads|popcash|casino|1xbet|1xlite|linebets|betting|adsterra|exoclick|juicyads|monetag|propellerads|hilltopads|ad-maven|adcash|bet365|clickadu|yllix|trafficstars|adpogo|trafficjunky|traffichunt|cpmstar|revenuehits|bidvertiser|admaven|richpush|megapush|pushame|pushground|popmyads|adnium|adskeeper|mgid|smartyads|clickaine|poponclick|zeropark|evadav|galaksion|adprovider|onclickmega|ero-advertising|plugrush|bongacash|popup\.win|poplinks|droplink|clk\.sh|gplinks|push\.house|notifyme\.top|payout=0\.|ads\/redirect|remoby|adfox|adsspyglass|rofrede|clickdealer|revcontent)/i;

  const site = h => h.split('.').slice(-2).join('.');
  const here = site(location.hostname);
  // Mirror domains of one site (hdhub4u.fr -> new15.hdhub4u.cl) share a name but not a TLD.
  const SLD2 = new Set(['co', 'com', 'org', 'net', 'gov', 'edu', 'ac']);
  const brand = h => { const p = h.split('.'), n = p.length; if (n < 2) return h; return p[(n >= 3 && p[n - 1].length === 2 && SLD2.has(p[n - 2])) ? n - 3 : n - 2]; };
  const hereBrand = brand(location.hostname);
  const sameSite = h => site(h) === here || (hereBrand.length >= 5 && brand(h) === hereBrand);

  let lastClick = null; // { interactive: bool }

  // toast=true only for a cross-site window.open that followed a real click on a button/link:
  // the one case where the user may have wanted the popup.
  const report = (url, toast) => {
    try {
      const u = parse(url);
      document.dispatchEvent(new CustomEvent('__lb_blocked', {
        detail: JSON.stringify({ u: (u ? u.href : String(url)).slice(0, 300), t: toast ? 1 : 0 }) }));
    } catch (_) {}
  };
  const userOk = h => (root.getAttribute('data-lb-ok') || '').split(' ').some(x => x && (h === x || h.endsWith('.' + x)));

  function parse(u) {
    try { return new URL(u || 'about:blank', location.href); } catch (_) { return null; }
  }

  // Should this navigation-to-a-new-window be allowed?
  function allowOpen(u) {
    if (off()) return true;
    if (u && AD_HOST_OR_URL.test(String(u))) return false; // Known ad network or clickunder URL
    if (!(navigator.userActivation && navigator.userActivation.isActive)) return false; // no real click -> popup ad
    const url = parse(u);
    if (!url) return false;
    if (url.href === 'about:blank') return !!(lastClick && lastClick.interactive); // open-blank-then-redirect trick
    if (url.protocol === 'blob:' || url.protocol === 'data:') return true;
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    if (AD_HOST_OR_URL.test(url.hostname)) return false;
    return sameSite(url.hostname) || OK_HOSTS.test(url.hostname) || userOk(url.hostname);
  }

  function toastWorthy(u) {
    if (!(navigator.userActivation && navigator.userActivation.isActive && lastClick && lastClick.interactive)) return false;
    const url = parse(u);
    return !!url && (url.protocol === 'http:' || url.protocol === 'https:');
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
      report(args[0] || 'about:blank', toastWorthy(args[0]));
      // Pretend it worked so scripts do not fall back to hijacking this tab.
      return stub();
    }
  });

  // ---- clicks ---------------------------------------------------------------
  const INTERACTIVE = 'a[href],button,input,select,summary,[role="button"],[role="link"],[onclick]';

  function isHijackOverlay(el) {
    if (!el || !(el instanceof Element)) return false;
    // Invisible / full-page element sitting on top of the page to steal clicks.
    try {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const cover = (r.width * r.height) / Math.max(1, innerWidth * innerHeight);
      const floating = cs.position === 'fixed' || cs.position === 'absolute';
      const zIndex = parseInt(cs.zIndex, 10);
      const isHighZ = !isNaN(zIndex) && zIndex >= 50;
      const opacity = parseFloat(cs.opacity);
      const invisible = opacity < 0.25 || cs.visibility === 'hidden' || cs.backgroundColor === 'rgba(0, 0, 0, 0)' || cs.backgroundColor === 'transparent';
      const empty = !(el.textContent || '').trim() && !el.querySelector('img,video,svg,canvas,input,button');
      
      // Full/large overlay covers significant area or high z-index overlay that is invisible/empty
      if (floating && (cover > 0.25 || isHighZ) && (invisible || empty)) return true;

      // Overlay link itself
      const a = el.closest('a[href]');
      if (a && a.target && a.target !== '_self') {
        const aStyle = getComputedStyle(a);
        const aRect = a.getBoundingClientRect();
        const aCover = (aRect.width * aRect.height) / Math.max(1, innerWidth * innerHeight);
        const aFloat = aStyle.position === 'fixed' || aStyle.position === 'absolute';
        const aInvisible = parseFloat(aStyle.opacity) < 0.25 || aStyle.visibility === 'hidden' || !(a.innerText || '').trim();
        if (aFloat && (aCover > 0.2 || parseInt(aStyle.zIndex, 10) >= 50) && aInvisible) {
          return true;
        }
      }
      return false;
    } catch (_) { return false; }
  }

  const noteDown = e => {
    if (!e.isTrusted) return;
    const t = e.target instanceof Element ? e.target : null;
    const control = !!t && !!t.closest && (!!t.closest(INTERACTIVE) || getComputedStyle(t).cursor === 'pointer');
    lastClick = { interactive: control && !isHijackOverlay(t), at: performance.now() };
  };
  for (const ev of ['pointerdown', 'mousedown', 'touchstart']) addEventListener(ev, noteDown, true);

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

    const control = !!t && !!t.closest && (!!t.closest(INTERACTIVE) || getComputedStyle(t).cursor === 'pointer');
    lastClick = { interactive: control && !isHijackOverlay(t), at: performance.now() };

    // Real click, but on an invisible click-catching overlay or link that opens new tab
    if (a && a.target && a.target !== '_self') {
      const u = parse(a.href);
      if (isHijackOverlay(a) || isHijackOverlay(t) || (u && AD_HOST_OR_URL.test(u.hostname + u.pathname))) {
        e.preventDefault(); e.stopImmediatePropagation(); report(a.href);
        return;
      }
    }
  }, true);

  // ---- current-tab hijack ---------------------------------------------------------
  // "Clickunder" variant: a click on the page body makes a script send THIS tab to an ad.
  // Only that exact pattern is blocked: script-started, cross-site, right after a real click
  // that was not on a button/link. Logins, SSO redirects, timers and form posts are untouched.
  if (window === window.top && window.navigation) {
    navigation.addEventListener('navigate', e => {
      try {
        if (off() || !e.cancelable || e.userInitiated || e.hashChange || e.formData || e.downloadRequest != null) return;
        if (e.navigationType !== 'push' && e.navigationType !== 'replace') return;
        const to = parse(e.destination.url);
        if (!to || (to.protocol !== 'http:' && to.protocol !== 'https:')) return;
        if (sameSite(to.hostname) || OK_HOSTS.test(to.hostname) || userOk(to.hostname)) return;
        if (!(navigator.userActivation && navigator.userActivation.isActive)) return;
        // needs a genuine, recent click on a non-control; keyboard activation (Enter in a form) is left alone
        if (!lastClick || lastClick.interactive || performance.now() - lastClick.at > 5000) return;
        e.preventDefault();
        report(to.href, false);
      } catch (_) {}
    });
  }

  // ---- forms that submit into a new tab ---------------------------------------------
  // Popunder scripts build a hidden <form target=_blank>, submit it on your first mouse press and
  // remove it. Blocked unless the form is visible AND you just clicked a real control, or the target
  // is the same site / a known sign-in or payment host. Attributes are read with getAttribute because
  // an <input name="action"> would shadow form.action.
  const frameNamed = t => { try { if (window.frames[t]) return true; } catch (_) {} return [...document.querySelectorAll('iframe,frame')].some(x => x.name === t); };
  function badForm(f) {
    if (off() || !(f instanceof HTMLFormElement)) return false;
    const t = (f.getAttribute('target') || '').toLowerCase();
    if (!t || t === '_self' || t === '_top' || t === '_parent') return false;
    if (t !== '_blank' && frameNamed(t)) return false;                    // posts into an iframe, not a popup
    const u = parse(f.getAttribute('action'));
    if (!u || (u.protocol !== 'http:' && u.protocol !== 'https:')) return false;
    if (sameSite(u.hostname) || OK_HOSTS.test(u.hostname) || userOk(u.hostname)) return false;
    const visible = f.getClientRects().length > 0;
    const fresh = !!lastClick && lastClick.interactive && performance.now() - lastClick.at < 5000;
    return !(visible && fresh);
  }

  const realSubmit = HTMLFormElement.prototype.submit;
  HTMLFormElement.prototype.submit = new Proxy(realSubmit, {
    apply(target, self, args) {
      if (badForm(self)) { report(self.getAttribute('action'), false); return; }
      return Reflect.apply(target, self, args);
    }
  });
  // requestSubmit() and script clicks on a submit button fire a submit event instead
  addEventListener('submit', e => {
    if (badForm(e.target)) { e.preventDefault(); e.stopImmediatePropagation(); report(e.target.getAttribute('action'), false); }
  }, true);
})();
