// Real-site check. Loads each site like a visitor would, pokes the page, and reports what LiteBlock did.
//   test/sites.json        public, sensible defaults (committed)
//   test/sites.local.json  YOUR private list, e.g. { "sites": ["https://..."] }  (gitignored, never committed)
// Safety: throwaway profile, downloads refused, nothing typed, no play/download buttons clicked on purpose.
const fs = require('fs'), path = require('path');
const { launch, check, done } = require('./helpers');
const load = f => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, f), 'utf8')).sites || []; } catch (_) { return []; } };
const sites = [...load('sites.json'), ...load('sites.local.json')];
const shots = path.join(__dirname, 'shots'); fs.mkdirSync(shots, { recursive: true });

(async () => {
  const b = await launch({ safe: true });
  const { ctx, sw } = b;
  const page = await ctx.newPage();
  const base = new Set(ctx.pages());
  const strays = () => ctx.pages().filter(p => !base.has(p) && p !== page && !p.url().startsWith('chrome-extension'));
  ctx.on('page', p => p.on('download', d => d.cancel().catch(() => {})));
  page.on('download', d => d.cancel().catch(() => {}));

  for (const url of sites) {
    const host = new URL(url).host;
    try {
      for (const p of strays()) await p.close().catch(() => {});
      await sw.evaluate(() => chrome.storage.session.clear());
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 35000 });
      const start = page.url();
      await page.waitForTimeout(3000);
      // behave like a visitor: a few clicks on the page, a scroll
      for (const [x, y] of [[420, 320], [700, 450], [300, 520]]) { await page.mouse.click(x, y).catch(() => {}); await page.waitForTimeout(900); }
      await page.mouse.wheel(0, 700); await page.waitForTimeout(1500);
      const tabId = await sw.evaluate(async u => { const t = await chrome.tabs.query({}); return (t.find(x => x.url && x.url.startsWith(u)) || t[0] || {}).id; }, new URL(page.url()).origin);
      const info = await sw.evaluate(async id => { const s = await chrome.storage.session.get('b' + id); return { popups: (s['b' + id] || []).length };
      }, tabId);
      const opened = strays().map(p => { try { return new URL(p.url()).host || 'blank'; } catch (_) { return 'blank'; } });
      const stayed = new URL(page.url()).host === new URL(start).host;
      const title = (await page.title().catch(() => '')) || '';
      await page.screenshot({ path: path.join(shots, host.replace(/[^a-z0-9.-]/gi, '_') + '.png') }).catch(() => {});
      console.log(`      ${host}: popups blocked by shield=${info.popups}, extra tabs=${opened.length}${opened.length ? ' [' + opened.join(', ') + ']' : ''}, stayed on site=${stayed}, title="${title.slice(0, 40)}"`);
      check(`${host}: no stray tabs, page not hijacked`, opened.length === 0 && stayed);
    } catch (e) { console.log(`SKIP  ${url}  (${e.message.split('\n')[0]})`); }
  }
  await b.close(); done();
})();
