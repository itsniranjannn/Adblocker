// LiteBlock bridge (isolated world). Two jobs, both event-driven:
//  1. mark paused sites so shield.js and cosmetic.css stand down
//  2. forward "popup blocked" notices to the background for the popup UI
(() => {
  const top = location.ancestorOrigins && location.ancestorOrigins.length
    ? new URL(location.ancestorOrigins[location.ancestorOrigins.length - 1]).hostname
    : location.hostname;

  chrome.storage.local.get('paused', ({ paused }) => {
    if (paused && paused.some(h => top === h || top.endsWith('.' + h))) {
      document.documentElement.setAttribute('data-lb-off', '');
    }
  });

  document.addEventListener('__lb_blocked', e => {
    try { chrome.runtime.sendMessage({ t: 'blocked', url: String(e.detail || '') }); } catch (_) {}
  });
})();
