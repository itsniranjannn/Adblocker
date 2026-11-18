// LiteBlock YouTube (MAIN world, youtube.com only). Best effort: YouTube changes often.
// Layer 1: strip ad data from player responses so ads never get scheduled.
// Layer 2: if an ad still plays, mute + jump to its end + click Skip.
// No polling: layer 2 is a single attribute observer on the player element.
(() => {
  'use strict';

  const AD_KEYS = ['adPlacements', 'playerAds', 'adSlots', 'adBreakHeartbeatParams'];
  const strip = o => {
    if (!o || typeof o !== 'object') return o;
    for (const k of AD_KEYS) if (k in o) delete o[k];
    if (o.playerResponse) strip(o.playerResponse);
    return o;
  };

  // Initial page load
  let initial;
  try {
    Object.defineProperty(window, 'ytInitialPlayerResponse', {
      configurable: true,
      get: () => initial,
      set: v => { initial = strip(v); }
    });
  } catch (_) {}

  // SPA navigation: player/next requests
  const realFetch = window.fetch;
  window.fetch = new Proxy(realFetch, {
    apply(target, self, args) {
      const p = Reflect.apply(target, self, args);
      let url = '';
      try { url = typeof args[0] === 'string' ? args[0] : args[0].url; } catch (_) {}
      if (!/\/youtubei\/v1\/(player|next)\b/.test(url)) return p;
      return p.then(async res => {
        try {
          const data = strip(await res.clone().json());
          return new Response(JSON.stringify(data), { status: res.status, statusText: res.statusText, headers: res.headers });
        } catch (_) { return res; }
      });
    }
  });

  // Layer 2
  let saved = null;
  const SKIP = '.ytp-skip-ad-button,.ytp-ad-skip-button,.ytp-ad-skip-button-modern';
  function check(player) {
    const video = player.querySelector('video.html5-main-video');
    if (player.classList.contains('ad-showing')) {
      if (video) {
        if (!saved) saved = { muted: video.muted, rate: video.playbackRate };
        video.muted = true;
        video.playbackRate = 16;
        if (isFinite(video.duration) && video.duration > 0) video.currentTime = video.duration;
      }
      const b = player.querySelector(SKIP);
      if (b) b.click();
    } else if (saved) {
      if (video) { video.muted = saved.muted; video.playbackRate = saved.rate; }
      saved = null;
    }
  }
  function hook() {
    const p = document.getElementById('movie_player');
    if (!p || p.__lb) return !!p;
    p.__lb = true;
    new MutationObserver(() => check(p)).observe(p, { attributes: true, attributeFilter: ['class'], subtree: true, attributeOldValue: false });
    check(p);
    return true;
  }
  const tryHook = (n = 20) => { if (!hook() && n > 0) setTimeout(() => tryHook(n - 1), 500); };
  addEventListener('yt-navigate-finish', () => tryHook());
  document.addEventListener('DOMContentLoaded', () => tryHook());
})();
