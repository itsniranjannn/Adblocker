// LiteBlock service worker. Event-driven only; sleeps the rest of the time.
// Network blocking itself is done natively by the browser (rules/ads.json).

importScripts('toast.js'); // defines lbToast()

const SESSION = chrome.storage.session;
const DNR = chrome.declarativeNetRequest;
const ALL_TYPES = ['main_frame', 'sub_frame', 'script', 'image', 'stylesheet', 'object', 'xmlhttprequest',
  'font', 'media', 'websocket', 'ping', 'other'];
const DIAG_MS = 120000;

function setup() {
  // Native per-tab blocked-request counter on the toolbar icon (zero cost).
  DNR.setExtensionActionOptions({ displayActionCountAsBadgeText: true });
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

// ---- user exceptions: paused sites + allowed domains -> dynamic rules -------
async function applyRules() {
  const { paused = [], allowed = [] } = await chrome.storage.local.get(['paused', 'allowed']);
  const old = await DNR.getDynamicRules();
  const add = [];
  paused.forEach((h, i) => add.push({
    id: 1 + i, priority: 100, action: { type: 'allowAllRequests' },
    condition: { requestDomains: [h], resourceTypes: ['main_frame', 'sub_frame'] } }));
  allowed.forEach((d, i) => add.push({
    id: 10001 + i, priority: 50, action: { type: 'allow' },
    condition: { requestDomains: [d], resourceTypes: ALL_TYPES } }));
  await DNR.updateDynamicRules({ removeRuleIds: old.map(r => r.id), addRules: add });
}

async function toggleList(key, value) {
  const cur = (await chrome.storage.local.get(key))[key] || [];
  const next = cur.includes(value) ? cur.filter(x => x !== value) : cur.concat(value);
  await chrome.storage.local.set({ [key]: next });
  await applyRules();
  return next;
}

// ---- diagnose mode: record what gets blocked on one tab, briefly ------------
// onRuleMatchedDebug exists only for unpacked extensions, and waking the worker
// for every blocked request is wasteful, so it is attached on demand and
// removed after two minutes.
let diag = null; // { tabId, until, seen: Map<host, count>, timer }

function onMatched(info) {
  if (!diag || info.request.tabId !== diag.tabId) return;
  if (Date.now() > diag.until) return stopDiag();
  let host; try { host = new URL(info.request.url).hostname; } catch (_) { return; }
  diag.seen.set(host, (diag.seen.get(host) || 0) + 1);
  clearTimeout(diag.timer);
  diag.timer = setTimeout(flushDiag, 300);
}
function flushDiag() {
  if (!diag) return;
  const rows = [...diag.seen].sort((a, b) => b[1] - a[1]).slice(0, 100);
  SESSION.set({ ['d' + diag.tabId]: rows, diagActive: diag.tabId });
}
function stopDiag() {
  if (!diag) return;
  flushDiag();
  if (DNR.onRuleMatchedDebug) DNR.onRuleMatchedDebug.removeListener(onMatched);
  SESSION.remove('diagActive');
  diag = null;
}
async function startDiag(tabId) {
  if (!DNR.onRuleMatchedDebug) return false; // packed/store build: not available
  stopDiag();
  await SESSION.remove('d' + tabId);
  diag = { tabId, until: Date.now() + DIAG_MS, seen: new Map(), timer: null };
  DNR.onRuleMatchedDebug.addListener(onMatched);
  await SESSION.set({ diagActive: tabId });
  setTimeout(stopDiag, DIAG_MS);
  return true;
}

// ---- messages ---------------------------------------------------------------
chrome.runtime.onMessage.addListener((msg, sender, send) => {
  if (msg.t === 'blocked' && sender.tab) { onBlockedPopup(sender.tab.id, msg); return; }
  if (msg.t === 'openok') { addOpenOk(msg.host); return; }
  if (msg.t === 'toggle') { toggleList('paused', msg.host).then(() => send(true)); return true; }
  if (msg.t === 'allow') { toggleList('allowed', msg.domain).then(() => send(true)); return true; }
  if (msg.t === 'diag') { startDiag(msg.tabId).then(send); return true; }
});

chrome.webNavigation.onCommitted.addListener(d => { if (d.frameId === 0) SESSION.remove('b' + d.tabId); });
chrome.tabs.onRemoved.addListener(id => SESSION.remove(['b' + id, 'd' + id, 'tt' + id]));

// ---- blocked popups: log them, and (rarely) offer to allow ------------------------
const TOAST_GAP_MS = 15000;
async function onBlockedPopup(tabId, msg) {
  const key = 'b' + tabId;
  const r = await SESSION.get(key);
  await SESSION.set({ [key]: (r[key] || []).concat(msg.url).slice(-20) });
  if (!msg.toast) return;                                   // ad-like block: stay silent
  let url; try { url = new URL(msg.url); } catch (_) { return; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  const { toast = true } = await chrome.storage.local.get('toast');
  if (!toast) return;
  const tk = 'tt' + tabId;
  const last = (await SESSION.get(tk))[tk] || 0;
  if (Date.now() - last < TOAST_GAP_MS) return;             // never spam
  await SESSION.set({ [tk]: Date.now() });
  try {
    await chrome.scripting.executeScript({ target: { tabId, frameIds: [0] }, func: lbToast, args: [url.href] });
  } catch (_) {}
}

async function addOpenOk(host) {
  if (typeof host !== 'string' || !/^[a-z0-9.-]+$/i.test(host)) return;
  const { openOk = [] } = await chrome.storage.local.get('openOk');
  if (!openOk.includes(host)) await chrome.storage.local.set({ openOk: openOk.concat(host) });
}
