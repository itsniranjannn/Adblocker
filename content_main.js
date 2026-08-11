// Main World Content Script for Lightweight Ad Blocker
// Runs directly in page context at document_start to block popunders, clickunders, and link hijacking

(function () {
  'use strict';

  // 1. Intercept window.open
  const originalOpen = window.open;
  const adKeywords = [
    'clickunder', 'popunder', 'casino', '1x', '1xbet', '1xlite', 'bet', 'linebets',
    'okx', 'redirect', 'adsterra', 'exoclick', 'juicyads', 'monetag', 'propellerads',
    'hilltopads', 'ad-maven', 'adcash', 'slot', 'poker', 'bonus', 'live', 'stream',
    'download', 'game', 'dating', 'adult', 'promo'
  ];

  window.open = function (url, target, features) {
    if (url && typeof url === 'string') {
      const lowerUrl = url.toLowerCase();
      if (adKeywords.some(kw => lowerUrl.includes(kw))) {
        console.warn('[AdBlocker] Blocked ad/clickunder window.open to:', url);
        window.postMessage({ type: 'ADBLOCKER_POPUP_BLOCKED', url }, '*');
        return null;
      }
    }

    // Inspect stack / event context for clickjacking on movie/streaming sites
    const event = window.event;
    if (event && (event.type === 'click' || event.type === 'mouseup' || event.type === 'mousedown')) {
      const targetEl = event.target;
      // If click was captured by window/document overlay or non-link element trying to open window
      if (targetEl && (targetEl.tagName === 'BODY' || targetEl.tagName === 'HTML' || targetEl.tagName === 'DIV' || targetEl.tagName === 'CANVAS')) {
        if (url && (url.includes('http') || url.includes('//'))) {
          console.warn('[AdBlocker] Blocked synthetic clickjack popunder to:', url);
          window.postMessage({ type: 'ADBLOCKER_POPUP_BLOCKED', url }, '*');
          return null;
        }
      }
    }

    return originalOpen.apply(this, arguments);
  };

  // 2. Intercept HTMLAnchorElement.prototype.click (used by movie site clickunder scripts)
  const originalClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    const href = this.href ? this.href.toLowerCase() : '';
    const target = this.target ? this.target.toLowerCase() : '';

    if (href && (adKeywords.some(kw => href.includes(kw)) || (target === '_blank' && this.dataset.generated))) {
      console.warn('[AdBlocker] Blocked programmatic clickunder link click to:', href);
      window.postMessage({ type: 'ADBLOCKER_POPUP_BLOCKED', url: href }, '*');
      return;
    }

    return originalClick.apply(this, arguments);
  };

  // 3. Prevent movie sites from attaching window.onbeforeunload popup traps
  window.addEventListener('beforeunload', function (e) {
    // Prevent popup alerts on leave
  }, true);

})();
