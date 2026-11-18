// LiteBlock bridge (isolated world). All event-driven, one storage read per page:
//  1. mark paused sites so shield.js and cosmetic.css stand down
//  2. apply the user's zapped elements for this site as plain CSS
//  3. forward "popup blocked" notices to the background for the popup UI
(() => {
  const top = location.ancestorOrigins && location.ancestorOrigins.length
    ? new URL(location.ancestorOrigins[location.ancestorOrigins.length - 1]).hostname
    : location.hostname;
  const bare = top.replace(/^www\./, '');

  chrome.storage.local.get(['paused', 'zaps'], ({ paused, zaps }) => {
    if (paused && paused.some(h => top === h || top.endsWith('.' + h))) {
      document.documentElement.setAttribute('data-lb-off', '');
    }
    if (window === window.top && zaps) {
      const sels = Object.keys(zaps).filter(h => bare === h || bare.endsWith('.' + h)).flatMap(h => zaps[h]);
      if (sels.length) {
        const st = document.createElement('style');
        st.setAttribute('data-lb-zap', '');
        st.textContent = sels.map(s => `${s}{display:none!important}`).join('\n');
        document.documentElement.append(st);
      }
    }
  });

  document.addEventListener('__lb_blocked', e => {
    try { chrome.runtime.sendMessage({ t: 'blocked', url: String(e.detail || '') }); } catch (_) {}
  });
})();
