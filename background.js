// LiteBlock service worker. Event-driven only; sleeps the rest of the time.
// Network blocking itself is done natively by the browser (rules/ads.json).

const SESSION = chrome.storage.session;

function setup() {
  // Native per-tab blocked-request counter on the toolbar icon (zero cost).
  chrome.declarativeNetRequest.setExtensionActionOptions({ displayActionCountAsBadgeText: true });
}
chrome.runtime.onInstalled.addListener(setup);
chrome.runtime.onStartup.addListener(setup);

// ---- close popup tabs whose load was blocked -------------------------------
// A blocked navigation leaves an error tab open. If the tab was opened by
// another tab (a popup), close it. Tabs you open yourself are never touched.
chrome.webNavigation.onErrorOccurred.addListener(async d => {
  if (d.frameId !== 0 || d.error !== 'net::ERR_BLOCKED_BY_CLIENT') return;
  try {
    const tab = await chrome.tabs.get(d.tabId);
    if (tab.openerTabId != null) chrome.tabs.remove(d.tabId);
  } catch (_) {}
});

// ---- per-tab list of popups blocked by the page shield ---------------------
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.t === 'blocked' && sender.tab) {
    const key = 'b' + sender.tab.id;
    SESSION.get(key).then(r => {
      const list = (r[key] || []).concat(msg.url).slice(-20);
      SESSION.set({ [key]: list });
    });
  }
});

chrome.webNavigation.onCommitted.addListener(d => { if (d.frameId === 0) SESSION.remove('b' + d.tabId); });
chrome.tabs.onRemoved.addListener(id => SESSION.remove('b' + id));

// ---- pause / resume a site --------------------------------------------------
async function applyPaused(paused) {
  const old = await chrome.declarativeNetRequest.getDynamicRules();
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: old.map(r => r.id),
    addRules: paused.map((h, i) => ({
      id: i + 1, priority: 100,
      action: { type: 'allowAllRequests' },
      condition: { requestDomains: [h], resourceTypes: ['main_frame', 'sub_frame'] }
    }))
  });
}

async function toggle(host) {
  const { paused = [] } = await chrome.storage.local.get('paused');
  const next = paused.includes(host) ? paused.filter(h => h !== host) : paused.concat(host);
  await chrome.storage.local.set({ paused: next });
  await applyPaused(next);
}

chrome.runtime.onMessage.addListener((msg, _s, send) => {
  if (msg.t === 'toggle') { toggle(msg.host).then(() => send(true)); return true; }
});
