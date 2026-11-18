// Deep probe for one or more sites (from test/sites.local.json, or argv). Opens a title page,
// taps around the player like a visitor and records every tab, popup attempt and anti-adblock wall.
// Safe mode: throwaway profile, downloads refused, nothing typed.
const fs = require('fs'), path = require('path');
const { launch } = require('./helpers');
const arg = process.argv.slice(2).filter(a => a.startsWith('http'));
const noExt = process.argv.includes('--no-ext');
let sites = arg;
if (!sites.length) { try { sites = JSON.parse(fs.readFileSync(path.join(__dirname, 'sites.local.json'), 'utf8')).sites; } catch (_) {} }
const shots = path.join(__dirname, 'shots'); fs.mkdirSync(shots, { recursive: true });
const WALL = /ad[\s-]?block|ads?\s+blocker|disable (your )?(ad|block)|turn off (your )?(ad|block)|whitelist|allow ads|please (disable|turn off)/i;

(async () => {
  const b = await launch({ safe: true, extension: !noExt });
  const { ctx, sw } = b;
  ctx.on('page', p => p.on('download', d => d.cancel().catch(() => {})));
  for (const url of sites) {
    const host = new URL(url).host;
    const page = await ctx.newPage();
    page.on('download', d => d.cancel().catch(() => {}));
    const log = [];
    const t0 = Date.now(), ts = () => ((Date.now() - t0) / 1000).toFixed(1) + 's';
    page.on('popup', async p => { await p.waitForLoadState('domcontentloaded').catch(() => {}); log.push(`${ts()} POPUP TAB -> ${p.url().slice(0, 90)}`); });
    page.on('dialog', d => { log.push(`${ts()} DIALOG ${d.type()}: ${d.message().slice(0, 60)}`); d.dismiss().catch(() => {}); });
    page.on('framenavigated', f => { if (f === page.mainFrame()) log.push(`${ts()} nav -> ${f.url().slice(0, 90)}`); });
    const wall = async tag => {
      const t = await page.evaluate(() => (document.body ? document.body.innerText : '').slice(0, 20000)).catch(() => '');
      const m = t.match(WALL); if (m) log.push(`${ts()} ANTI-ADBLOCK TEXT (${tag}): "...${t.slice(Math.max(0, m.index - 40), m.index + 80).replace(/\s+/g, ' ')}..."`);
    };
    try {
      console.log(`\n=== ${host}${noExt ? '  (extension OFF)' : ''}`);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 35000 });
      await page.waitForTimeout(3500); await wall('landing');
      // open a title page: first same-site link that wraps an image
      const href = await page.evaluate(() => {
        const h = location.hostname;
        const a = [...document.querySelectorAll('a[href]')].find(a => a.querySelector('img') && new URL(a.href, location.href).hostname === h && !a.href.endsWith('#') && new URL(a.href).pathname.length > 2);
        return a ? a.href : null; });
      log.push(`${ts()} title link: ${href ? new URL(href).pathname.slice(0, 50) : 'none'}`);
      if (href) { await page.goto(href, { waitUntil: 'domcontentloaded', timeout: 35000 }).catch(() => {}); await page.waitForTimeout(3500); await wall('title page'); }
      await page.screenshot({ path: path.join(shots, host + '.title.png') }).catch(() => {});
      // tap around the main area several times, like a visitor looking for the play button
      const pts = [[640, 360], [640, 300], [500, 380], [780, 380], [640, 450], [640, 360]];
      for (let i = 0; i < pts.length; i++) {
        await page.mouse.click(pts[i][0], pts[i][1]).catch(() => {});
        await page.waitForTimeout(1500);
        if (i === 1 || i === pts.length - 1) await wall('after taps');
      }
      // try obvious play controls (visible text/aria "play" / "watch")
      const play = page.locator('button:has-text("Play"), a:has-text("Watch"), a:has-text("Play"), [aria-label*="lay" i]').first();
      if (await play.count()) { log.push(`${ts()} clicking play-like control`); await play.click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(3500); await wall('after play'); }
      await page.screenshot({ path: path.join(shots, host + '.after.png') }).catch(() => {});
      const blocked = noExt ? '-' : await sw.evaluate(async () => { const s = await chrome.storage.session.get(null); return Object.entries(s).filter(([k]) => /^b\d+$/.test(k)).map(([, v]) => v.length).reduce((a, c) => a + c, 0); });
      log.push(`${ts()} shield blocked popups: ${blocked}`);
      const extra = ctx.pages().filter(p => p !== page && !p.url().startsWith('chrome-extension') && p.url() !== 'about:blank');
      log.push(`${ts()} tabs still open besides this one: ${extra.length}${extra.length ? ' [' + extra.map(p => new URL(p.url()).host).join(', ') + ']' : ''}`);
      for (const p of extra) await p.close().catch(() => {});
    } catch (e) { log.push('ERROR ' + e.message.split('\n')[0]); }
    console.log(log.join('\n'));
    await page.close().catch(() => {});
  }
  await b.close();
})();
