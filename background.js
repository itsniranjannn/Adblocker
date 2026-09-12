// Background Service Worker for Ad Blocker Pro

// Keywords that indicate a URL is an ad/popunder redirect
const AD_REDIRECT_KEYWORDS = [
  'clickunder', 'popunder', '1xbet', '1xlite', 'linebets', 'casino',
  'okx.com', 'betting', 'popads', 'popcash', 'adsterra', 'exoclick', 'juicyads',
  'monetag', 'propellerads', 'hilltopads', 'ad-maven', 'adcash',
  'redirect', 'vortex', 'bet365', 'spin', 'jackpot',
  'syndication', 'clickadu', 'yllix', 'trafficstars', 'adpogo', 'ad-delivery',
  'trafficjunky', 'traffichunt', 'cpmstar', 'revenuehits', 'bidvertiser',
  'admaven', 'richpush', 'megapush', 'pushame', 'pushground',
  // Additional redirect/popup ad networks and link-shorteners abused for ads
  'popmyads', 'adnium', 'adskeeper', 'mgid', 'smartyads', 'clickaine',
  'popcash', 'poponclick', 'zeropark', 'evadav', 'galaksion', 'adprovider',
  'onclickmega', 'ero-advertising', 'plugrush', 'bongacash', 'clicksor',
  'popup.win', 'poplinks', 'shrink-service', 'linkvertise', 'adfoc.us',
  'ouo.io', 'shorte.st', 'exe.io', 'droplink', 'clk.sh', 'gplinks',
  'earn2short', 'links.wtf', 'megaline', 'v-ads', 'go2cloud', 'affde',
  'affbank', 'offerforge', 'apilayer.click', 'push.house', 'notifyme.top',
  'adk2', 'adotmob', 'displayx', 'ad-mediaflow',
  // Seen in the wild: fake-play-button redirect networks
  'macan-native', 'payout=0.', '/ads/redirect',
  // Common piracy-site popup redirect domains
  '2osb.com', 'remoby', 'adfox', 'adsspyglass', 'rofrede',
  'clickdealer', 'smartadserver', 'revcontent'
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

// 3. POPUNDER TAB DETECTION & CLOSURE
//
// NOTE: We only close tabs that match a KNOWN ad-redirect keyword. We removed
// the old "different domain / blank tab opened from a high-risk site" guess —
// that heuristic also caught genuine tabs YOU open (ctrl/middle-click on a
// streaming site frequently opens a different-domain video source, or a
// blank tab that fills in a moment later) and was closing them, which is
// exactly the false-positive this rewrite fixes. The real popunder defense
// lives in content_main.js (blocks untrusted/synthetic window.open calls at
// the page level, where we can actually tell a real click from a fake one) —
// this background-script check is just a backstop for confirmed ad URLs.
chrome.tabs.onCreated.addListener((tab) => {
  chrome.storage.local.get(['settings'], (res) => {
    const settings = res.settings || { blockPopups: true };
    if (!settings.blockPopups) return;

    if (!tab.openerTabId) return; // Only care about tabs opened by other tabs

    const pendingUrl = (tab.pendingUrl || tab.url || '').toLowerCase();

    // Known ad URL in the new tab — close immediately, regardless of active state
    const isAdPopunder = AD_REDIRECT_KEYWORDS.some(kw => pendingUrl.includes(kw));
    if (isAdPopunder) {
      chrome.tabs.remove(tab.id, () => {
        if (chrome.runtime.lastError) return;
        incrementStat('popupsBlocked');
      });
      return;
    }

    // If the tab has no URL yet (about:blank), give it a moment to resolve,
    // then close it ONLY if it resolved to a known ad keyword. This still
    // catches the classic "open about:blank, then redirect via location=" trick
    // without touching legitimate blank-then-load tabs.
    if (!pendingUrl || pendingUrl === 'about:blank') {
      setTimeout(() => {
        chrome.tabs.get(tab.id, (updatedTab) => {
          if (chrome.runtime.lastError || !updatedTab) return;
          const finalUrl = (updatedTab.url || updatedTab.pendingUrl || '').toLowerCase();
          const resolvedToAd = AD_REDIRECT_KEYWORDS.some(kw => finalUrl.includes(kw));
          if (resolvedToAd) {
            chrome.tabs.remove(tab.id, () => {
              if (chrome.runtime.lastError) return;
              incrementStat('popupsBlocked');
            });
          }
        });
      }, 700);
    }
  });
});

// 4. AUTO-CLOSE POPUP TABS BLOCKED BY EXTENSION RULES
// When declarativeNetRequest (rules.json) blocks a page load, the tab shows
// "This page has been blocked by an extension" but STAYS OPEN — the user has
// to manually close it. Detect this and auto-close popup tabs.
chrome.webNavigation.onErrorOccurred.addListener((details) => {
  if (details.frameId !== 0) return; // Only main frame
  if (details.error !== 'net::ERR_BLOCKED_BY_CLIENT') return;

  chrome.tabs.get(details.tabId, (tab) => {
    if (chrome.runtime.lastError) return;
    // Only auto-close if this tab was opened by another tab (it's a popup),
    // not if the user navigated here directly
    if (tab.openerTabId) {
      chrome.tabs.remove(details.tabId, () => {
        if (chrome.runtime.lastError) return;
        incrementStat('popupsBlocked');
      });
    }
  });
});

// 5. Message handler from content scripts
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'INCREMENT_STAT') {
    incrementStat(message.key, message.count || 1);
  }
  return true;
});