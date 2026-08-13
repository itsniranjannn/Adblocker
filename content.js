// Content Script for Ad Blocker Pro (ISOLATED world)
// Handles: overlay removal, floating ad cards, YouTube ad skip, Facebook sponsored, mutation observer

(function () {
  'use strict';

  // ============================================================================
  // STATS BATCHING
  // ============================================================================
  let statsBatch = { adsBlocked: 0, popupsBlocked: 0, ytAdsSkipped: 0, fbSponsoredRemoved: 0 };
  let batchTimer = null;

  function queueStat(key, count = 1) {
    statsBatch[key] = (statsBatch[key] || 0) + count;
    if (!batchTimer) {
      batchTimer = setTimeout(flushStats, 1000);
    }
  }

  function flushStats() {
    batchTimer = null;
    for (const key in statsBatch) {
      if (statsBatch[key] > 0) {
        try {
          chrome.runtime.sendMessage({ type: 'INCREMENT_STAT', key, count: statsBatch[key] });
        } catch (e) {}
        statsBatch[key] = 0;
      }
    }
  }

  // Listen for popup block notifications from main world (content_main.js)
  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'ADBLOCKER_POPUP_BLOCKED') {
      queueStat('popupsBlocked', 1);
    }
  });

  // ============================================================================
  // SAFE-SITE LIST — skip aggressive heuristic scam-text checks on major sites
  // These sites have legitimate UI that triggers false positives
  // ============================================================================
  const SAFE_SITES = [
    'youtube.com', 'youtu.be', 'facebook.com', 'fb.com', 'google.com',
    'twitter.com', 'x.com', 'instagram.com', 'reddit.com', 'linkedin.com',
    'github.com', 'stackoverflow.com', 'wikipedia.org', 'amazon.com',
    'netflix.com', 'twitch.tv', 'discord.com', 'whatsapp.com', 'tiktok.com',
    'microsoft.com', 'apple.com', 'spotify.com', 'mail.google.com'
  ];

  const currentHost = window.location.hostname.toLowerCase();
  const isOnSafeSite = SAFE_SITES.some(domain => currentHost === domain || currentHost.endsWith('.' + domain));
  const isYouTube = currentHost.includes('youtube.com');
  const isFacebook = currentHost.includes('facebook.com');

  // ============================================================================
  // VIDEO PLAYER DETECTION — prevent removing elements that are part of a player
  // Streaming sites use transparent full-screen high-z-index divs as click layers
  // ============================================================================
  const PLAYER_INDICATORS = [
    'player', 'video', 'jw-', 'plyr', 'vjs-', 'flowplayer', 'mejs',
    'html5-video', 'wp-video', 'video-js', 'mediaelement', 'shaka',
    'clappr', 'artplayer', 'dplayer', 'oplayer', 'xgplayer'
  ];

  function isNearVideoPlayer(node) {
    if (!node || node.nodeType !== 1) return false;

    // 1. Does this node or any ancestor have a player-related class/id?
    let el = node;
    let depth = 0;
    while (el && el !== document.body && depth < 6) {
      const id = (el.id || '').toLowerCase();
      const cls = typeof el.className === 'string' ? el.className.toLowerCase() : '';
      if (PLAYER_INDICATORS.some(kw => id.includes(kw) || cls.includes(kw))) return true;
      // Check for data attributes common in players
      if (el.hasAttribute && (el.hasAttribute('data-player') || el.hasAttribute('data-video-id'))) return true;
      el = el.parentElement;
      depth++;
    }

    // 2. Does this node contain a video/iframe/embed/object?
    if (node.querySelector && node.querySelector('video, iframe, embed, object')) return true;

    // 3. Does a sibling contain a video/iframe?
    if (node.parentElement) {
      const siblings = node.parentElement.children;
      for (let i = 0; i < siblings.length; i++) {
        if (siblings[i] !== node) {
          if (siblings[i].tagName === 'VIDEO' || siblings[i].tagName === 'IFRAME' ||
              siblings[i].tagName === 'EMBED' || siblings[i].tagName === 'OBJECT') return true;
          if (siblings[i].querySelector && siblings[i].querySelector('video, iframe, embed, object')) return true;
        }
      }
    }

    // 4. Is there a video/iframe anywhere on the page near this node (within parent container)?
    if (node.parentElement && node.parentElement.parentElement) {
      const grandparent = node.parentElement.parentElement;
      if (grandparent.querySelector && grandparent.querySelector('video, iframe')) return true;
    }

    return false;
  }

  // ============================================================================
  // 1. CAPTURE-PHASE CLICK INTERCEPTOR — KILL TRANSPARENT OVERLAYS ON CLICK
  // When you click anywhere on a streaming site, invisible overlays intercept
  // the click and trigger popunders. We detect and destroy them in capture phase.
  // ============================================================================
  function handleCaptureClick(e) {
    const target = e.target;
    if (!target) return;

    let current = target;
    let depth = 0;

    while (current && current !== document.body && current !== document.documentElement && depth < 5) {
      // Check class/id for obvious ad overlay names
      const id = (current.id || '').toLowerCase();
      const className = typeof current.className === 'string' ? current.className.toLowerCase() : '';

      const isAdOverlay = (
        id.includes('popunder') || id.includes('clickunder') || id.includes('clickjack') ||
        id.includes('overlay-ad') || id.includes('ad-overlay') ||
        className.includes('popunder') || className.includes('clickunder') || className.includes('clickjack') ||
        className.includes('pop-overlay') || className.includes('popunder-mask') ||
        className.includes('ad-overlay') || className.includes('overlay-ad')
      );

      if (isAdOverlay) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        current.remove();
        queueStat('popupsBlocked', 1);
        return;
      }

      // Detect invisible full-screen overlays via computed style
      try {
        const style = window.getComputedStyle(current);
        const pos = style.position;
        const isPositioned = pos === 'fixed' || pos === 'absolute';
        const opacity = parseFloat(style.opacity);
        const zIndex = parseInt(style.zIndex, 10);
        const isHighZ = !isNaN(zIndex) && zIndex > 900;
        const isTransparent = opacity < 0.15 || style.visibility === 'hidden' ||
          style.backgroundColor === 'transparent' || style.backgroundColor === 'rgba(0, 0, 0, 0)';
        const w = current.offsetWidth || 0;
        const h = current.offsetHeight || 0;
        const coversScreen = w >= window.innerWidth * 0.5 && h >= window.innerHeight * 0.5;
        const hasNoText = !(current.innerText || '').trim();

        if (isPositioned && (isHighZ || coversScreen) && isTransparent && hasNoText) {
          // Don't remove if this is part of a video player
          if (isNearVideoPlayer(current)) continue;

          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          current.remove();
          queueStat('popupsBlocked', 1);
          return;
        }
      } catch (err) {}

      current = current.parentElement;
      depth++;
    }
  }

  document.addEventListener('click', handleCaptureClick, true);
  document.addEventListener('mousedown', handleCaptureClick, true);
  document.addEventListener('pointerdown', handleCaptureClick, true);

  // ============================================================================
  // 2. PROACTIVE OVERLAY SCANNER — runs on page load + mutations
  // Finds and removes invisible overlays BEFORE user clicks
  // ============================================================================
  function purgeInvisibleOverlays() {
    const allEls = document.querySelectorAll('div, span, section, ins, aside, a');
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    for (let i = 0; i < allEls.length; i++) {
      const node = allEls[i];
      if (node._adChecked) continue;
      node._adChecked = true;

      try {
        const style = window.getComputedStyle(node);
        const pos = style.position;
        if (pos !== 'fixed' && pos !== 'absolute') continue;

        const zIndex = parseInt(style.zIndex, 10);
        if (isNaN(zIndex) || zIndex < 900) continue;

        const w = node.offsetWidth || 0;
        const h = node.offsetHeight || 0;
        if (w < vw * 0.5 || h < vh * 0.5) continue;

        const opacity = parseFloat(style.opacity);
        const isTransparent = opacity < 0.15 || style.visibility === 'hidden' ||
          style.backgroundColor === 'transparent' || style.backgroundColor === 'rgba(0, 0, 0, 0)';
        const hasNoText = !(node.innerText || '').trim();
        const hasNoMedia = node.querySelectorAll('input, select, textarea, video, iframe, embed, object').length === 0;

        if (isTransparent && hasNoText && hasNoMedia) {
          // Don't remove if this node is part of a video player
          if (isNearVideoPlayer(node)) continue;

          console.warn('[AdBlocker] Purged invisible clickjack overlay:', node.tagName, node.className);
          node.remove();
          queueStat('popupsBlocked', 1);
        }
      } catch (err) {}
    }
  }

  // ============================================================================
  // 3. FLOATING FAKE NOTIFICATION / TOAST / PUSH AD CARD REMOVER
  // These are the annoying cards like "Save your FB account" or "VPN needed"
  //
  // FIXED: Much tighter heuristics to avoid false positives on legitimate sites
  // ============================================================================
  const SCAM_KEYWORDS = [
    'hacked', 'save your', 'fb account', 'security alert', 'virus detected',
    'vpn needed', 'warning:', 'cleaner', 'update your browser', 'winner',
    'prize', 'casino', '1xbet', 'congratulations', 'infected', 'threat detected',
    'malware', 'antivirus', 'mcafee', 'norton', 'avast', 'your device is',
    'your computer is', 'your phone is', 'battery low', 'storage full',
    'click here to fix', 'critical error', 'system warning'
  ];

  const ACTION_KEYWORDS = [
    'click here', 'download now', 'install now', 'claim now',
    'enable now', 'activate now', 'close ad', 'learn more'
  ];

  // Elements that should never be considered floating ad cards
  const SKIP_TAGS = new Set([
    'SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT', 'HEAD', 'HTML',
    'VIDEO', 'AUDIO', 'CANVAS', 'SVG', 'IMG', 'IFRAME', 'BR', 'HR',
    'INPUT', 'SELECT', 'TEXTAREA', 'FORM', 'NAV', 'HEADER', 'FOOTER', 'MAIN'
  ]);

  function isFloatingAdCard(node) {
    if (!node || node.nodeType !== 1) return false;

    // Never remove structural or non-visual elements
    if (SKIP_TAGS.has(node.tagName)) return false;

    // Quick class/id check for known ad-specific patterns (these are safe on any site)
    const id = (node.id || '').toLowerCase();
    const cls = typeof node.className === 'string' ? node.className.toLowerCase() : '';

    const hasAdClassName = (
      cls.includes('push-card') || cls.includes('push-box') || cls.includes('notification-ad') ||
      cls.includes('push-notification') && !cls.includes('browser') || cls.includes('web-push') ||
      cls.includes('in-page-push') || cls.includes('toast-ad') || cls.includes('ipp-widget') ||
      cls.includes('inpage-push') || cls.includes('popunder') || cls.includes('popup-ad') ||
      cls.includes('ad-popup') || cls.includes('pop-overlay') || cls.includes('click-jack')
    );

    const hasAdIdName = (
      id.includes('push-ad') || id.includes('notification-ad') || id.includes('popunder') ||
      id.includes('popup-ad') || id.includes('inpage-push')
    );

    if (hasAdClassName || hasAdIdName) {
      return true;
    }

    // On safe/major sites, ONLY use explicit class/id matching above.
    // Do NOT apply heuristic scam-text checks — they cause false positives.
    if (isOnSafeSite) return false;

    // Heuristic: floating element with scam text (only on non-safe sites)
    const text = (node.innerText || '').toLowerCase();
    if (text.length < 15 || text.length > 500) return false;

    // Require BOTH a scam keyword AND an action keyword
    const hasScamText = SCAM_KEYWORDS.some(kw => text.includes(kw));
    const hasAction = ACTION_KEYWORDS.some(kw => text.includes(kw));

    if (hasScamText && hasAction) {
      try {
        const style = window.getComputedStyle(node);
        const pos = style.position;
        const zIndex = parseInt(style.zIndex, 10);
        // Require floating position AND z-index >= 100
        const isFloating = (pos === 'fixed' || pos === 'absolute') && !isNaN(zIndex) && zIndex >= 100;

        if (isFloating) return true;
      } catch (e) {}
    }

    return false;
  }

  function removeFloatingAds(rootNode) {
    if (!rootNode || rootNode.nodeType !== 1) return;

    // Check the node itself
    if (isFloatingAdCard(rootNode)) {
      console.warn('[AdBlocker] Removed floating ad card:', rootNode.tagName, rootNode.className);
      rootNode.remove();
      queueStat('popupsBlocked', 1);
      return;
    }

    // Check children that match known ad-specific selectors only
    if (rootNode.querySelectorAll) {
      const matches = rootNode.querySelectorAll(`
        [class*="popunder"], [class*="popup-ad"], [class*="ad-popup"],
        [id*="popunder"], [id*="popup-ad"], [class*="push-notification"]:not([class*="browser"]),
        [class*="web-push"], [class*="in-page-push"], [class*="notification-ad"],
        [class*="push-popup"], [class*="push-card"], [class*="toast-ad"],
        [class*="ipp-widget"], [class*="inpage-push"], [class*="notify-popup"],
        [id*="push-ad"], [id*="notification-ad"], .pop-overlay, .click-jack-overlay,
        .popunder-mask, .popunder-overlay
      `);
      for (let i = 0; i < matches.length; i++) {
        console.warn('[AdBlocker] Removed matched ad element:', matches[i].tagName, matches[i].className);
        matches[i].remove();
        queueStat('popupsBlocked', 1);
      }
    }
  }

  // ============================================================================
  // 4. YOUTUBE VIDEO AD AUTO-SKIPPER
  // Runs on a dedicated interval for reliability instead of only on mutations.
  // Updated with 2026 YouTube ad selectors.
  // ============================================================================

  // All known YouTube ad-showing indicators
  const YT_AD_INDICATORS = [
    '.ad-showing',
    '.ytp-ad-showing',
    '.ad-interrupting',
    '.ytp-ad-player-overlay',
    '.ytp-ad-player-overlay-instream-info',
    '.ytp-ad-preview-container'
  ];

  // All known YouTube skip button selectors
  const YT_SKIP_SELECTORS = [
    '.ytp-ad-skip-button',
    '.ytp-ad-skip-button-modern',
    '.ytp-skip-ad-button',
    '.ytp-ad-skip-button-container button',
    'button.ytp-ad-skip-button-modern',
    '.ytp-ad-overlay-close-button',
    '.ytp-ad-skip-button-slot button',
    '[class*="ytp-ad-skip"] button',
    '.ytp-ad-survey-answer-button'
  ];

  // Elements to remove outright
  const YT_AD_REMOVE_SELECTORS = [
    '#player-ads',
    'ytd-promoted-sparkles-web-renderer',
    'ytd-display-ad-renderer',
    'ytd-ad-slot-renderer',
    'ytd-banner-promo-renderer',
    'ytd-in-feed-ad-layout-renderer',
    'ytd-statement-banner-renderer',
    'ytd-promoted-video-renderer',
    'ytd-merch-shelf-renderer',
    'ytd-action-companion-ad-renderer',
    'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-ads"]',
    '#masthead-ad',
    '.ytp-ad-overlay-container',
    '.ytp-ad-message-container',
    '.ytp-ad-action-interstitial'
  ];

  function handleYouTubeAds() {
    if (!isYouTube) return;

    // 1. Skip/fast-forward video ads
    const adShowing = document.querySelector(YT_AD_INDICATORS.join(', '));
    const video = document.querySelector('video');

    if (adShowing && video) {
      // Mute the ad
      video.muted = true;

      // Speed up to maximum
      try { video.playbackRate = 16.0; } catch (e) {}

      // Seek to end of ad
      if (isFinite(video.duration) && video.duration > 0) {
        video.currentTime = video.duration - 0.1;
      }

      // Click any available skip button
      const skipBtn = document.querySelector(YT_SKIP_SELECTORS.join(', '));
      if (skipBtn) {
        try {
          skipBtn.click();
          queueStat('ytAdsSkipped', 1);
        } catch (e) {}
      }
    }

    // 2. Restore playback rate and unmute after ad ends
    if (!adShowing && video && video.muted && video.playbackRate > 2) {
      video.muted = false;
      video.playbackRate = 1.0;
    }

    // 3. Remove ad overlay/companion elements from the page
    const adElements = document.querySelectorAll(YT_AD_REMOVE_SELECTORS.join(', '));
    for (let i = 0; i < adElements.length; i++) {
      adElements[i].remove();
      queueStat('ytAdsSkipped', 1);
    }
  }

  // ============================================================================
  // 5. FACEBOOK SPONSORED POST CLEANER
  // Facebook obfuscates "Sponsored" text by splitting it across multiple spans.
  // We detect this by looking for the actual rendered text in feed posts.
  // ============================================================================

  function isFacebookSponsored(post) {
    if (!post || post.dataset.fbAdChecked) return false;
    post.dataset.fbAdChecked = 'true';

    // Method 1: Check for aria-label="Sponsored" or link to /ads/about
    if (post.querySelector('[aria-label="Sponsored"], a[href*="/ads/about"]')) {
      return true;
    }

    // Method 2: Look for "Sponsored" text — Facebook splits it across <span> elements.
    // Walk all <a> tags and <span> tags looking for the text "Sponsored" assembled
    // from individual characters in separate spans.
    const links = post.querySelectorAll('a[href*="ads"], a[aria-label]');
    for (let i = 0; i < links.length; i++) {
      const linkText = (links[i].textContent || '').trim();
      if (linkText === 'Sponsored' || linkText === 'Promoted') {
        return true;
      }
      const ariaLabel = (links[i].getAttribute('aria-label') || '').trim();
      if (ariaLabel === 'Sponsored' || ariaLabel === 'Promoted') {
        return true;
      }
    }

    // Method 3: Look for spans whose combined text spells "Sponsored"
    // Facebook uses: <span><span>S</span><span>p</span>...<span>d</span></span>
    const allSpans = post.querySelectorAll('span');
    for (let i = 0; i < allSpans.length; i++) {
      const span = allSpans[i];
      // Only check spans that contain child spans (the split-letter pattern)
      if (span.children.length >= 5 && span.children.length <= 15) {
        let assembled = '';
        for (let c = 0; c < span.children.length; c++) {
          assembled += (span.children[c].textContent || '');
        }
        assembled = assembled.trim();
        if (assembled === 'Sponsored' || assembled === 'Promoted') {
          return true;
        }
      }
    }

    // Method 4: Direct innerText check (works when FB doesn't obfuscate)
    const text = post.innerText || '';
    if (text.includes('Sponsored') && post.querySelector('a[href*="/ads/about"]')) {
      return true;
    }

    return false;
  }

  function handleFacebookSponsored(node) {
    if (!isFacebook) return;

    // Find feed post containers
    const postSelectors = 'div[data-pagelet*="FeedUnit"], div[role="feed"] > div, div[data-pagelet*="feed"] > div';
    const posts = (node.nodeType === 1 && node.matches && node.matches(postSelectors))
      ? [node]
      : (node.querySelectorAll ? node.querySelectorAll(postSelectors) : []);

    posts.forEach(post => {
      if (isFacebookSponsored(post)) {
        post.style.display = 'none';
        queueStat('fbSponsoredRemoved', 1);
      }
    });
  }

  // Full-page Facebook scan (for posts loaded via infinite scroll)
  function scanFacebookFeed() {
    if (!isFacebook) return;

    const feedPosts = document.querySelectorAll(
      'div[data-pagelet*="FeedUnit"], div[role="feed"] > div, div[data-pagelet*="feed"] > div'
    );

    feedPosts.forEach(post => {
      if (isFacebookSponsored(post)) {
        post.style.display = 'none';
        queueStat('fbSponsoredRemoved', 1);
      }
    });
  }

  // ============================================================================
  // 6. MUTATION OBSERVER — watches for dynamically injected ad elements
  // ============================================================================
  let pendingNodes = [];
  let isFrameScheduled = false;

  function processAddedNodes() {
    isFrameScheduled = false;
    const nodes = pendingNodes;
    pendingNodes = [];

    if (isYouTube) handleYouTubeAds();

    // Run overlay purge on non-safe streaming sites
    if (!isOnSafeSite) {
      purgeInvisibleOverlays();
    }

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (node.nodeType !== 1) continue;

      if (isFacebook) handleFacebookSponsored(node);

      // Remove floating ad cards and known ad class elements
      removeFloatingAds(node);
    }
  }

  const observer = new MutationObserver((mutations) => {
    for (let i = 0; i < mutations.length; i++) {
      const added = mutations[i].addedNodes;
      for (let j = 0; j < added.length; j++) {
        if (added[j].nodeType === 1) {
          pendingNodes.push(added[j]);
        }
      }
    }

    if (pendingNodes.length > 0 && !isFrameScheduled) {
      isFrameScheduled = true;
      requestAnimationFrame(processAddedNodes);
    }
  });

  // ============================================================================
  // INITIALIZATION
  // ============================================================================
  function init() {
    // Initial purge of any overlays already on the page (skip on safe sites)
    if (!isOnSafeSite) {
      purgeInvisibleOverlays();
    }

    // Also scan body children for floating ad cards
    if (document.body) {
      const bodyChildren = document.body.children;
      for (let i = 0; i < bodyChildren.length; i++) {
        removeFloatingAds(bodyChildren[i]);
      }
    }

    // Start observing for dynamic ads
    const targetNode = document.body || document.documentElement;
    if (targetNode) {
      observer.observe(targetNode, { childList: true, subtree: true });
    }

    // Re-run overlay purge a few seconds after load (some ads inject late)
    if (!isOnSafeSite) {
      setTimeout(purgeInvisibleOverlays, 2000);
      setTimeout(purgeInvisibleOverlays, 5000);
    }

    // YouTube: dedicated interval for reliable ad skipping
    if (isYouTube) {
      handleYouTubeAds();
      setInterval(handleYouTubeAds, 500);
    }

    // Facebook: periodic scan for sponsored posts (infinite scroll loads new ones)
    if (isFacebook) {
      scanFacebookFeed();
      setInterval(scanFacebookFeed, 2000);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
