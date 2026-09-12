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
    'admaven', 'richpush', 'megapush', 'pushame', 'pushground',
    'popmyads', 'adnium', 'adskeeper', 'mgid', 'smartyads', 'clickaine',
    'poponclick', 'zeropark', 'evadav', 'galaksion', 'adprovider',
    'onclickmega', 'ero-advertising', 'plugrush', 'bongacash', 'clicksor',
    'popup.win', 'poplinks', 'shrink-service', 'linkvertise', 'adfoc.us',
    'ouo.io', 'shorte.st', 'exe.io', 'droplink', 'clk.sh', 'gplinks',
    'earn2short', 'links.wtf', 'megaline', 'v-ads', 'go2cloud',
    'push.house', 'notifyme.top', 'adk2', 'adotmob', 'displayx',
    'ad-mediaflow', 'macan-native', 'payout=0.', '/ads/redirect',
    // Common piracy-site popup redirect domains
    '2osb.com', 'remoby', 'adfox', 'adsspyglass', 'rofrede',
    'clickdealer', 'smartadserver', 'revcontent'
  ];

  function isAdUrl(url) {
    if (!url || typeof url !== 'string') return false;
    const lower = url.toLowerCase();
    return adKeywords.some(kw => lower.includes(kw));
  }

  // ============================================================================
  // SAFE MOCK WINDOW — the correct middle ground.
  // - closed: false forever (old bug) => busy-wait loops (`while(!win.closed){}`)
  //   spin forever => frozen tab.
  // - null (previous attempted fix) => `win.document.write(...)` or
  //   `win.location = url` on a null throws an uncaught TypeError, which can
  //   abort the rest of that script — including unrelated code (like video
  //   player init) bundled in the same file — and can even let a popup
  //   through if it interrupts our own blocking logic mid-way.
  // - This mock: closed is TRUE from the very first read, so any busy-wait
  //   exits immediately, and every property/method access is a safe no-op
  //   via Proxy, so nothing the site does to it can throw.
  // ============================================================================
  function createMockWindow() {
    const loc = {
      replace: function () {},
      assign: function () {},
      reload: function () {},
      href: 'about:blank',
      toString: function () { return 'about:blank'; }
    };

    const doc = {
      write: function () {},
      writeln: function () {},
      close: function () {},
      open: function () { return doc; },
      body: null,
      location: loc,
      addEventListener: function () {},
      removeEventListener: function () {}
    };

    const mock = {
      closed: true, // TRUE immediately — busy-wait loops exit on first check
      location: loc,
      document: doc,
      opener: null,
      name: '',
      focus: function () {},
      blur: function () {},
      close: function () {},
      postMessage: function () {},
      stop: function () {},
      moveTo: function () {},
      resizeTo: function () {},
      addEventListener: function () {},
      removeEventListener: function () {}
    };

    try {
      return new Proxy(mock, {
        get(target, prop) {
          if (prop in target) return target[prop];
          // Unknown property/method the site tries to call — return a
          // harmless no-op function rather than undefined, so
          // `win.someAdSdkMethod()` doesn't throw "is not a function".
          return function () { return undefined; };
        },
        set() {
          // Silently swallow all writes (e.g. win.location = 'adurl')
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

  // Track popup timing to enforce one-popup-per-click — legitimate sites never
  // need to open two popups from one user action, but piracy sites piggyback
  // extra window.open calls on every click/mouseup/pointerup.
  let lastAllowedPopupTime = 0;

  function interceptedOpen(url, target, features) {
    const strUrl = typeof url === 'string' ? url : (url ? String(url) : '');
    const event = window.event;

    // A. Known ad URL — block immediately
    if (isAdUrl(strUrl)) {
      console.warn('[AdBlocker] Blocked window.open to ad URL:', strUrl);
      window.postMessage({ type: 'ADBLOCKER_POPUP_BLOCKED', url: strUrl }, '*');
      return createMockWindow();
    }

    // B. Triggered during a click/mouse/touch event
    if (event && (event.type === 'click' || event.type === 'mouseup' || event.type === 'mousedown' || event.type === 'pointerup' || event.type === 'pointerdown' || event.type === 'touchend')) {
      const targetEl = event.target;

      // B1. Untrusted (synthetic) event — always block
      if (!event.isTrusted) {
        console.warn('[AdBlocker] Blocked synthetic click window.open:', strUrl);
        window.postMessage({ type: 'ADBLOCKER_POPUP_BLOCKED', url: strUrl }, '*');
        return createMockWindow();
      }

      // B2. Check if the user actually clicked on a real visible <a> link
      let isGenuineLink = false;
      let clickedLinkEl = null;
      let el = targetEl;
      let depth = 0;
      while (el && el !== document.body && depth < 8) {
        if (el.tagName === 'A' && el.href && el.offsetWidth > 0 && el.offsetHeight > 0 && !el.href.startsWith('javascript:')) {
          isGenuineLink = true;
          clickedLinkEl = el;
          break;
        }
        // Also allow buttons inside links, form submits, etc.
        if (el.tagName === 'BUTTON' || el.tagName === 'INPUT') {
          // Check if parent is a link
          const parentLink = el.closest('a[href]');
          if (parentLink && parentLink.offsetWidth > 0) {
            isGenuineLink = true;
            clickedLinkEl = parentLink;
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
        return createMockWindow();
      }

      // If about:blank or empty URL opened from a link click, it's likely a popunder trick
      if (!strUrl || strUrl === 'about:blank' || strUrl === '') {
        console.warn('[AdBlocker] Blocked blank window.open (popunder setup):', strUrl);
        window.postMessage({ type: 'ADBLOCKER_POPUP_BLOCKED', url: 'about:blank' }, '*');
        return createMockWindow();
      }

      // B3. PIGGYBACK POPUNDER DETECTION — the #1 piracy site technique.
      // When the user clicks a genuine <a> link, the BROWSER already navigates
      // to that link's href. An EXTRA window.open() to a DIFFERENT domain during
      // the same click is a piggyback popunder riding the trusted user action.
      if (clickedLinkEl) {
        try {
          const openHost = new URL(strUrl, location.href).hostname;
          const linkHost = new URL(clickedLinkEl.href, location.href).hostname;
          const pageHost = location.hostname;
          // Popup goes to a domain that is NEITHER the clicked link's domain
          // NOR the current page — third-party popup → ad
          if (openHost !== linkHost && openHost !== pageHost) {
            console.warn('[AdBlocker] Blocked cross-domain piggyback popup:', strUrl, '(clicked link goes to:', clickedLinkEl.href, ')');
            window.postMessage({ type: 'ADBLOCKER_POPUP_BLOCKED', url: strUrl }, '*');
            return createMockWindow();
          }
        } catch (e) {}
      }

      // B4. ONE POPUP PER USER ACTION — piracy sites register click handlers on
      // click + mouseup + pointerup that each call window.open(). Legitimate
      // sites never open two popups from one gesture. Block any window.open
      // within 100ms of a previously allowed one.
      const now = Date.now();
      if (now - lastAllowedPopupTime < 100) {
        console.warn('[AdBlocker] Blocked duplicate popup from same user action:', strUrl);
        window.postMessage({ type: 'ADBLOCKER_POPUP_BLOCKED', url: strUrl }, '*');
        return createMockWindow();
      }
      lastAllowedPopupTime = now;
    }

    // C. No event context but opening about:blank (script-initiated popunder setup)
    if (!event && (!strUrl || strUrl === 'about:blank')) {
      console.warn('[AdBlocker] Blocked script-initiated blank window.open');
      window.postMessage({ type: 'ADBLOCKER_POPUP_BLOCKED', url: 'about:blank' }, '*');
      return createMockWindow();
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