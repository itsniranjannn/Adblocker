// Main World Content Script for Lightweight Ad Blocker Pro
// Runs directly in page context at document_start to block popunders, clickunders, and link hijacking
// MAIN world = same JS context as the page, so we can override window.open etc.

(function () {
  'use strict';

  // ============================================================================
  // AD URL KEYWORD DETECTION
  // ============================================================================
  const adKeywords = [
    'clickunder', 'popunder', 'popads', 'popcash', 'casino', '1xbet', '1xlite',
    'linebets', 'betting', 'okx', 'adsterra', 'exoclick', 'juicyads',
    'monetag', 'propellerads', 'hilltopads', 'ad-maven', 'adcash',
    'onclick', 'bet365', 'spin', 'jackpot', 'syndication',
    'clickadu', 'yllix', 'trafficstars', 'adpogo', 'ad-delivery',
    'trafficjunky', 'traffichunt', 'cpmstar', 'revenuehits', 'bidvertiser',
    'admaven', 'richpush', 'megapush', 'pushame', 'pushground'
  ];

  function isAdUrl(url) {
    if (!url || typeof url !== 'string') return false;
    const lower = url.toLowerCase();
    return adKeywords.some(kw => lower.includes(kw));
  }

  // ============================================================================
  // MOCK WINDOW PROXY - absorbs popunder location assignments
  // Sites do: var w = window.open('about:blank'); w.location = 'ad-url';
  // We return a fake window object that swallows all those writes.
  // ============================================================================
  function createMockWindow(blockedUrl) {
    const loc = {
      replace: function () {},
      assign: function () {},
      reload: function () {},
      href: 'about:blank',
      toString: function () { return 'about:blank'; }
    };

    const mock = {
      closed: false,
      location: loc,
      focus: function () {},
      blur: function () {},
      close: function () { this.closed = true; },
      postMessage: function () {},
      stop: function () {},
      moveTo: function () {},
      resizeTo: function () {},
      document: {
        write: function () {},
        writeln: function () {},
        close: function () {},
        open: function () {},
        body: null,
        location: loc
      }
    };

    // Proxy to catch any property set (especially location = 'url')
    try {
      return new Proxy(mock, {
        get(target, prop) {
          if (prop === 'location') return loc;
          if (prop in target) return target[prop];
          return function () {};
        },
        set(target, prop, value) {
          if (prop === 'location' || prop === 'href') {
            console.warn('[AdBlocker] Trapped popunder location assignment:', value);
            window.postMessage({ type: 'ADBLOCKER_POPUP_BLOCKED', url: String(value) }, '*');
          }
          return true;
        }
      });
    } catch (e) {
      return mock;
    }
  }

  // ============================================================================
  // 1. INTERCEPT window.open — THE MAIN POPUNDER KILLER
  // ============================================================================
  const originalOpen = window.open;

  function interceptedOpen(url, target, features) {
    const strUrl = typeof url === 'string' ? url : (url ? String(url) : '');
    const event = window.event;

    // A. Known ad URL — block immediately
    if (isAdUrl(strUrl)) {
      console.warn('[AdBlocker] Blocked window.open to ad URL:', strUrl);
      window.postMessage({ type: 'ADBLOCKER_POPUP_BLOCKED', url: strUrl }, '*');
      return createMockWindow(strUrl);
    }

    // B. Triggered during a click/mouse/touch event
    if (event && (event.type === 'click' || event.type === 'mouseup' || event.type === 'mousedown' || event.type === 'pointerup' || event.type === 'pointerdown' || event.type === 'touchend')) {
      const targetEl = event.target;

      // B1. Untrusted (synthetic) event — always block
      if (!event.isTrusted) {
        console.warn('[AdBlocker] Blocked synthetic click window.open:', strUrl);
        window.postMessage({ type: 'ADBLOCKER_POPUP_BLOCKED', url: strUrl }, '*');
        return createMockWindow(strUrl);
      }

      // B2. Check if the user actually clicked on a real visible <a> link
      let isGenuineLink = false;
      let el = targetEl;
      let depth = 0;
      while (el && el !== document.body && depth < 5) {
        if (el.tagName === 'A' && el.href && el.offsetWidth > 0 && el.offsetHeight > 0 && !el.href.startsWith('javascript:')) {
          isGenuineLink = true;
          break;
        }
        // Also allow buttons inside links, form submits, etc.
        if (el.tagName === 'BUTTON' || el.tagName === 'INPUT') {
          // Check if parent is a link
          const parentLink = el.closest('a[href]');
          if (parentLink && parentLink.offsetWidth > 0) {
            isGenuineLink = true;
          }
          break;
        }
        el = el.parentElement;
        depth++;
      }

      // If not clicking a genuine link, this is a clickjack popunder — BLOCK IT
      if (!isGenuineLink) {
        console.warn('[AdBlocker] Blocked clickjack popunder (click on non-link element):', strUrl || 'about:blank', 'clicked:', targetEl?.tagName);
        window.postMessage({ type: 'ADBLOCKER_POPUP_BLOCKED', url: strUrl || 'about:blank' }, '*');
        return createMockWindow(strUrl);
      }

      // If about:blank or empty URL opened from a link click, it's likely a popunder trick
      if (!strUrl || strUrl === 'about:blank' || strUrl === '') {
        console.warn('[AdBlocker] Blocked blank window.open (popunder setup):', strUrl);
        window.postMessage({ type: 'ADBLOCKER_POPUP_BLOCKED', url: 'about:blank' }, '*');
        return createMockWindow(strUrl);
      }
    }

    // C. No event context but opening about:blank (script-initiated popunder setup)
    if (!event && (!strUrl || strUrl === 'about:blank')) {
      console.warn('[AdBlocker] Blocked script-initiated blank window.open');
      window.postMessage({ type: 'ADBLOCKER_POPUP_BLOCKED', url: 'about:blank' }, '*');
      return createMockWindow(strUrl);
    }

    // Passed all checks — allow the window.open
    try {
      return originalOpen.apply(this, arguments);
    } catch (e) {
      return null;
    }
  }

  // Freeze window.open so ad scripts cannot overwrite our interceptor
  try {
    Object.defineProperty(window, 'open', {
      value: interceptedOpen,
      writable: false,
      configurable: false
    });
  } catch (e) {
    window.open = interceptedOpen;
  }

  // ============================================================================
  // 2. INTERCEPT PROGRAMMATIC ANCHOR CLICKS (another popunder technique)
  // Sites create invisible <a target="_blank" href="ad-url"> and call .click()
  // ============================================================================
  const originalAnchorClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    const href = this.href || '';
    const target = (this.target || '').toLowerCase();
    const isDisconnected = !this.isConnected;
    const isInvisible = this.offsetWidth === 0 || this.offsetHeight === 0;
    const isBlankTarget = target === '_blank' || target === '_new';

    // Block if: ad URL, or invisible/detached anchor opening new tab
    if (isAdUrl(href) || (isBlankTarget && (isDisconnected || isInvisible))) {
      console.warn('[AdBlocker] Blocked programmatic anchor clickunder:', href);
      window.postMessage({ type: 'ADBLOCKER_POPUP_BLOCKED', url: href }, '*');
      return;
    }

    return originalAnchorClick.apply(this, arguments);
  };

  // ============================================================================
  // 3. BLOCK ONBEFOREUNLOAD POPUP TRAPS
  // ============================================================================
  try {
    Object.defineProperty(window, 'onbeforeunload', {
      configurable: true,
      get: () => null,
      set: () => {}
    });
  } catch (e) {}

  // ============================================================================
  // 4. SUPPRESS NOTIFICATION PERMISSION SPAM
  // ============================================================================
  if (window.Notification) {
    try {
      window.Notification.requestPermission = function () {
        console.warn('[AdBlocker] Suppressed notification permission prompt.');
        return Promise.resolve('denied');
      };
    } catch (e) {}
  }

  // ============================================================================
  // 5. BLOCK document.createElement('a') + click() POPUNDER PATTERN
  // ============================================================================
  const originalCreateElement = document.createElement.bind(document);
  document.createElement = function (tagName) {
    const el = originalCreateElement(tagName);
    if (tagName.toLowerCase() === 'a') {
      const origClick = el.click;
      el.click = function () {
        const href = this.href || '';
        const target = (this.target || '').toLowerCase();
        if ((target === '_blank' || target === '_new') && !this.isConnected) {
          console.warn('[AdBlocker] Blocked createElement(a).click() popunder:', href);
          window.postMessage({ type: 'ADBLOCKER_POPUP_BLOCKED', url: href }, '*');
          return;
        }
        return origClick.apply(this, arguments);
      };
    }
    return el;
  };

})();
