// Background Service Worker for Lightweight Ad Blocker

// Keywords for popunder / clickunder / ad redirects
const AD_REDIRECT_KEYWORDS = [
  'clickunder', 'popunder', '1x', '1xbet', '1xlite', 'linebets', 'casino',
  'okx.com', 'betting', 'popads', 'popcash', 'adsterra', 'exoclick', 'juicyads',
  'monetag', 'propellerads', 'hilltopads', 'ad-maven', 'adcash', 'banner',
  'promo', 'bonus', 'slot', 'poker', 'female', 'live', 'stream', 'domain',
  'redirect', 'click', 'link'
];

// Initialize statistics
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['stats', 'settings'], (result) => {
    if (!result.stats) {
      chrome.storage.local.set({
        stats: {
          adsBlocked: 0,
          popupsBlocked: 0,
          ytAdsSkipped: 0,
          fbSponsoredRemoved: 0,
          trackersBlocked: 0
        },
        settings: {
          blockAds: true,
          blockPopups: true,
          ytAutoSkip: true,
          fbCleaner: true,
          blockTrackers: true
        }
      });
    }
  });
});

// Listener for declarativeNetRequest blocked requests
if (chrome.declarativeNetRequest && chrome.declarativeNetRequest.onRuleMatchedDebug) {
  chrome.declarativeNetRequest.onRuleMatchedDebug.addListener((info) => {
    incrementStat('adsBlocked');
  });
}

// 1. webNavigation listener to intercept navigation to clickunder / ad domains
chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId !== 0) return; // Only main frame navigations for new tabs/popups

  const url = (details.url || '').toLowerCase();
  
  chrome.storage.local.get(['settings'], (res) => {
    const settings = res.settings || { blockPopups: true };
    if (!settings.blockPopups) return;

    const isAdUrl = AD_REDIRECT_KEYWORDS.some(kw => url.includes(kw));

    if (isAdUrl && details.tabId) {
      // Close the popunder tab immediately
      chrome.tabs.remove(details.tabId, () => {
        if (chrome.runtime.lastError) return;
        incrementStat('popupsBlocked');
      });
    }
  });
});

// 2. Track new tab creation (popunder detection)
chrome.tabs.onCreated.addListener((tab) => {
  chrome.storage.local.get(['settings'], (res) => {
    const settings = res.settings || { blockPopups: true };
    if (!settings.blockPopups) return;

    // Check if the tab was created without active user focus (classic popunder)
    if (tab.openerTabId && !tab.active) {
      const pendingUrl = (tab.pendingUrl || tab.url || '').toLowerCase();
      
      const isAdPopunder = AD_REDIRECT_KEYWORDS.some(kw => pendingUrl.includes(kw));

      if (isAdPopunder || pendingUrl.includes('http')) {
        chrome.tabs.get(tab.openerTabId, (openerTab) => {
          if (chrome.runtime.lastError || !openerTab) return;
          const openerUrl = (openerTab.url || '').toLowerCase();

          // High-risk streaming / movie sites that trigger popunders
          const streamingKeywords = ['movie', 'sports', 'stream', 'full4movies', 'india4movies', 'cinevo', 'watch', 'free', 'hd'];
          const isFromStreamingSite = streamingKeywords.some(kw => openerUrl.includes(kw));

          if (isAdPopunder || isFromStreamingSite) {
            chrome.tabs.remove(tab.id, () => {
              if (chrome.runtime.lastError) return;
              incrementStat('popupsBlocked');
            });
          }
        });
      }
    }
  });
});

function incrementStat(key, count = 1) {
  chrome.storage.local.get(['stats'], (res) => {
    const stats = res.stats || { adsBlocked: 0, popupsBlocked: 0, ytAdsSkipped: 0, fbSponsoredRemoved: 0, trackersBlocked: 0 };
    stats[key] = (stats[key] || 0) + count;
    if (key !== 'adsBlocked') {
      stats.adsBlocked = (stats.adsBlocked || 0) + count;
    }
    chrome.storage.local.set({ stats });
  });
}

// Message handler for content script updates
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'INCREMENT_STAT') {
    incrementStat(message.key, message.count || 1);
  }
  return true;
});
