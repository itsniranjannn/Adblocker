// Content Script for Lightweight Ad Blocker

(function () {
  'use strict';

  // State
  let ytSkippedCount = 0;
  let fbRemovedCount = 0;
  let popupBlockedCount = 0;

  // Helper to send stat updates to background service worker
  function reportStat(key, count = 1) {
    try {
      chrome.runtime.sendMessage({ type: 'INCREMENT_STAT', key, count });
    } catch (e) {
      // Context invalidated or extension reloaded
    }
  }

  // ============================================================================
  // 1. POPUNDER & CLICKJACK OVERLAY NEUTRALIZER
  // ============================================================================
  function injectMainWorldScript() {
    try {
      const script = document.createElement('script');
      script.textContent = `
        (function() {
          const originalOpen = window.open;
          const adKeywords = [
            'casino', 'bet', 'linebets', 'popunder', 'click', 'redirect',
            'adsterra', 'exoclick', 'juicyads', 'monetag', 'propellerads',
            'hilltopads', 'ad-maven', 'adcash', 'slot', 'poker', 'female',
            'bonus', 'live', 'stream'
          ];

          window.open = function(url, target, features) {
            if (url && typeof url === 'string') {
              const lowerUrl = url.toLowerCase();
              if (adKeywords.some(kw => lowerUrl.includes(kw))) {
                console.log('[AdBlocker] Blocked ad popup window to:', url);
                window.postMessage({ type: 'ADBLOCKER_POPUP_BLOCKED' }, '*');
                return null;
              }
            }

            // Check if window.open was triggered without direct real click event
            const event = window.event;
            if (event && (event.type === 'click' || event.type === 'mouseup' || event.type === 'mousedown')) {
              const targetEl = event.target;
              if (targetEl && (targetEl.tagName === 'BODY' || targetEl.tagName === 'HTML' || targetEl.getAttribute('z-index'))) {
                console.log('[AdBlocker] Blocked clickjack popunder opening:', url);
                window.postMessage({ type: 'ADBLOCKER_POPUP_BLOCKED' }, '*');
                return null;
              }
            }

            return originalOpen.apply(this, arguments);
          };
        })();
      `;
      (document.head || document.documentElement).appendChild(script);
      script.remove();
    } catch (e) {}
  }

  // Listen for popup block messages from main world
  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'ADBLOCKER_POPUP_BLOCKED') {
      reportStat('popupsBlocked', 1);
    }
  });

  // Remove full-screen clickjack transparent overlays often found on sports/streaming sites
  function removeClickjackOverlays() {
    const elements = document.querySelectorAll('div, section, iframe');
    elements.forEach(el => {
      if (!el || el.dataset.adblockChecked) return;
      el.dataset.adblockChecked = 'true';

      const style = window.getComputedStyle(el);
      const zIndex = parseInt(style.zIndex, 10);
      const isFixedOrAbs = style.position === 'fixed' || style.position === 'absolute';
      const rect = el.getBoundingClientRect();
      const coversScreen = rect.width >= window.innerWidth * 0.8 && rect.height >= window.innerHeight * 0.8;

      // If ultra-high z-index transparent overlay covering screen
      if (isFixedOrAbs && zIndex > 9999 && coversScreen && (parseFloat(style.opacity) < 0.1 || style.backgroundColor === 'transparent')) {
        console.log('[AdBlocker] Removed full-screen clickjack overlay element:', el);
        el.remove();
        reportStat('popupsBlocked', 1);
      }

      // Remove popup ad bubbles like "Watch the most beautiful female fights!"
      const text = el.innerText ? el.innerText.trim() : '';
      if (text.includes('Watch the most beautiful') || text.includes('Click here to bet') || text.includes('Win big bonus')) {
        if (style.position === 'fixed' || style.position === 'absolute') {
          el.remove();
          reportStat('adsBlocked', 1);
        }
      }
    });
  }

  // ============================================================================
  // 2. YOUTUBE VIDEO AD AUTO-SKIPPER & CLEANER
  // ============================================================================
  function handleYouTubeAds() {
    if (!window.location.hostname.includes('youtube.com')) return;

    // 1. Skip Video Ads
    const video = document.querySelector('video');
    const adShowing = document.querySelector('.ytp-ad-showing, .ad-interrupting, .ytp-ad-player-overlay');
    
    if (adShowing && video) {
      video.muted = true;
      video.playbackRate = 16.0;
      if (isFinite(video.duration) && video.duration > 0) {
        video.currentTime = video.duration || 9999;
      }

      // Auto click Skip Ad buttons
      const skipButtons = document.querySelectorAll(`
        .ytp-ad-skip-button,
        .ytp-ad-skip-button-modern,
        .ytp-skip-ad-button,
        .ytp-ad-skip-button-container button,
        button.ytp-ad-skip-button-single-modern,
        .ytp-ad-overlay-close-button
      `);

      skipButtons.forEach(btn => {
        try {
          btn.click();
          reportStat('ytAdsSkipped', 1);
        } catch (e) {}
      });
    }

    // 2. Remove YouTube Home Feed & Player Ad Containers
    const ytAdSelectors = `
      ytd-promoted-sparkles-web-renderer,
      ytd-display-ad-renderer,
      ytd-ad-slot-renderer,
      ytd-banner-promo-renderer,
      ytd-in-feed-ad-layout-renderer,
      ytd-statement-banner-renderer,
      .ytp-ad-overlay-container,
      .ytp-ad-message-container,
      #player-ads
    `;

    document.querySelectorAll(ytAdSelectors).forEach(el => {
      el.remove();
      reportStat('adsBlocked', 1);
    });

    // Remove feed item cards with #ad-badge
    document.querySelectorAll('ytd-rich-item-renderer').forEach(item => {
      if (item.querySelector('#ad-badge, .ytd-ad-slot-renderer')) {
        item.remove();
        reportStat('adsBlocked', 1);
      }
    });
  }

  // ============================================================================
  // 3. FACEBOOK SPONSORED POST CLEANER
  // ============================================================================
  function handleFacebookSponsored() {
    if (!window.location.hostname.includes('facebook.com')) return;

    // Scan feed posts
    const posts = document.querySelectorAll('div[data-pagelet*="FeedUnit"], div[role="feed"] > div, div[aria-label="Sponsored"]');
    
    posts.forEach(post => {
      if (post.dataset.fbAdChecked) return;
      post.dataset.fbAdChecked = 'true';

      let isSponsored = false;

      // 1. Text inspection
      const text = post.innerText || '';
      if (text.includes('Sponsored') || text.includes('Promoted') || text.includes('Sponsored link')) {
        isSponsored = true;
      }

      // 2. Aria-label inspection
      if (post.querySelector('[aria-label="Sponsored"], [aria-label="Promoted"], a[href*="/ads/about"]')) {
        isSponsored = true;
      }

      // 3. Obfuscated SVG / use tag inspection
      if (post.querySelector('use[href*="sp_"], use[xlink\\:href*="sp_"]')) {
        isSponsored = true;
      }

      if (isSponsored) {
        post.style.display = 'none';
        post.style.height = '0';
        post.style.overflow = 'hidden';
        reportStat('fbSponsoredRemoved', 1);
      }
    });

    // Sidebar Sponsored Blocks
    document.querySelectorAll('[data-pagelet="RightRail"] div, div[role="complementary"] div').forEach(side => {
      if (side.innerText && side.innerText.includes('Sponsored') && side.querySelector('a[href*="l.facebook.com/l.php"]')) {
        side.style.display = 'none';
        reportStat('fbSponsoredRemoved', 1);
      }
    });
  }

  // ============================================================================
  // INITIALIZATION & OBSERVERS
  // ============================================================================
  injectMainWorldScript();

  // Run initial cleaning
  function runCleaners() {
    removeClickjackOverlays();
    handleYouTubeAds();
    handleFacebookSponsored();
  }

  runCleaners();

  // DOM MutationObserver for dynamic page loads & infinite scrolling
  const observer = new MutationObserver(() => {
    runCleaners();
  });

  if (document.body || document.documentElement) {
    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true
    });
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      observer.observe(document.body, { childList: true, subtree: true });
    });
  }

  // Periodic fallback check for fast video playback & sticky overlays
  setInterval(runCleaners, 1000);

})();
