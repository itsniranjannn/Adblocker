// Background Service Worker for Ad Blocker Pro

// Keywords that indicate a URL is an ad/popunder redirect
const AD_REDIRECT_KEYWORDS = [
  'clickunder', 'popunder', '1xbet', '1xlite', 'linebets', 'casino',
  'okx.com', 'betting', 'popads', 'popcash', 'adsterra', 'exoclick', 'juicyads',
  'monetag', 'propellerads', 'hilltopads', 'ad-maven', 'adcash',
  'redirect', 'vortex', 'bet365', 'spin', 'jackpot',
  'syndication', 'clickadu', 'yllix', 'trafficstars', 'adpogo', 'ad-delivery',
  'trafficjunky', 'traffichunt', 'cpmstar', 'revenuehits', 'bidvertiser',
  'admaven', 'richpush', 'megapush', 'pushame', 'pushground'
];

// High-risk domains where popunders are common
const HIGH_RISK_DOMAINS = [
  'movie', 'sports', 'stream', 'full4movies', 'india4movies', 'cinevo',
  'watch', 'torrent', 'download', 'anime', 'manga',
  'hdhub4u', 'hubstream', 'hdbay', 'hubdrive', 'moviesdrive', 'vegamovies',
  'filmyzilla', 'tamilrockers', 'movierulz', 'bollyflix', 'extramovies',
  'mp4moviez', 'filmymeet', 'worldfree4u', 'sdmoviespoint', 'themoviesflix'
];

// Initialize storage
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['stats', 'settings'], (result) => {
    if (!result.stats) {
      chrome.storage.local.set({
        stats: {
          adsBlocked: 0,
          popupsBlocked: 0,
          ytAdsSkipped: 0,
          fbSponsoredRemoved: 0
        },
        settings: {
          blockAds: true,
          blockPopups: true,
          ytAutoSkip: true,
          fbCleaner: true
        }
      });
    }
  });
});

// Increment stat counters
function incrementStat(key, count = 1) {
  chrome.storage.local.get(['stats'], (res) => {
    const stats = res.stats || { adsBlocked: 0, popupsBlocked: 0, ytAdsSkipped: 0, fbSponsoredRemoved: 0 };
    stats[key] = (stats[key] || 0) + count;
    if (key !== 'adsBlocked') {
      stats.adsBlocked = (stats.adsBlocked || 0) + count;
    }
    chrome.storage.local.set({ stats });
  });
}

// Track which tabs had user-initiated link clicks (to distinguish real navigation from popunders)
const userNavigationTabs = new Set();

// 1. Listen for declarativeNetRequest blocked network requests
if (chrome.declarativeNetRequest && chrome.declarativeNetRequest.onRuleMatchedDebug) {
  chrome.declarativeNetRequest.onRuleMatchedDebug.addListener(() => {
    incrementStat('adsBlocked');
  });
}

// 2. Navigation Interception — close tabs navigating to ad domains
chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId !== 0) return;

  const url = (details.url || '').toLowerCase();

  chrome.storage.local.get(['settings'], (res) => {
    const settings = res.settings || { blockPopups: true };
    if (!settings.blockPopups) return;

    const isAdUrl = AD_REDIRECT_KEYWORDS.some(kw => url.includes(kw));

    if (isAdUrl && details.tabId) {
      chrome.tabs.remove(details.tabId, () => {
        if (chrome.runtime.lastError) return;
        incrementStat('popupsBlocked');
      });
    }
  });
});

// 3. AGGRESSIVE POPUNDER TAB DETECTION & CLOSURE
chrome.tabs.onCreated.addListener((tab) => {
  chrome.storage.local.get(['settings'], (res) => {
    const settings = res.settings || { blockPopups: true };
    if (!settings.blockPopups) return;

    if (!tab.openerTabId) return; // Only care about tabs opened by other tabs

    const pendingUrl = (tab.pendingUrl || tab.url || '').toLowerCase();

    // A. Known ad URL in the new tab — close immediately
    const isAdPopunder = AD_REDIRECT_KEYWORDS.some(kw => pendingUrl.includes(kw));
    if (isAdPopunder) {
      chrome.tabs.remove(tab.id, () => {
        if (chrome.runtime.lastError) return;
        incrementStat('popupsBlocked');
      });
      return;
    }

    // B. Tab opened in background (not active) — classic popunder
    if (!tab.active) {
      chrome.tabs.remove(tab.id, () => {
        if (chrome.runtime.lastError) return;
        incrementStat('popupsBlocked');
      });
      return;
    }

    // C. Tab opened from a high-risk streaming/movie site going to a different domain
    chrome.tabs.get(tab.openerTabId, (openerTab) => {
      if (chrome.runtime.lastError || !openerTab) return;
      const openerUrl = (openerTab.url || '').toLowerCase();
      const isFromHighRiskSite = HIGH_RISK_DOMAINS.some(kw => openerUrl.includes(kw));

      if (isFromHighRiskSite) {
        try {
          const openerHost = new URL(openerTab.url).hostname;
          const tabUrl = tab.pendingUrl || tab.url || '';
          
          // If no URL yet (about:blank setup) or going to a different domain
          if (!tabUrl || tabUrl === 'about:blank' || tabUrl === 'chrome://newtab/') {
            // Wait briefly to see if it navigates to an ad
            setTimeout(() => {
              chrome.tabs.get(tab.id, (updatedTab) => {
                if (chrome.runtime.lastError) return;
                const finalUrl = (updatedTab.url || updatedTab.pendingUrl || '').toLowerCase();
                if (!finalUrl || finalUrl === 'about:blank' || !finalUrl.includes(openerHost)) {
                  chrome.tabs.remove(tab.id, () => {
                    if (chrome.runtime.lastError) return;
                    incrementStat('popupsBlocked');
                  });
                }
              });
            }, 500);
          } else {
            const tabHost = new URL(tabUrl).hostname;
            if (tabHost !== openerHost && !tabHost.endsWith('.' + openerHost)) {
              chrome.tabs.remove(tab.id, () => {
                if (chrome.runtime.lastError) return;
                incrementStat('popupsBlocked');
              });
            }
          }
        } catch (e) {
          // URL parsing failed — probably a weird ad URL, close it
          chrome.tabs.remove(tab.id, () => {
            if (chrome.runtime.lastError) return;
            incrementStat('popupsBlocked');
          });
        }
      }
    });
  });
});

// 4. Message handler from content scripts
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'INCREMENT_STAT') {
    incrementStat(message.key, message.count || 1);
  }
  return true;
});
