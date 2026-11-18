// Real-site smoke test: does each page load, and does it stay free of extra tabs?
// Network dependent, so a site that is unreachable is reported as SKIP, not FAIL.
const { launch, check, done } = require('./helpers');
const { sites } = require('./sites.json');
(async () => {
  const b = await launch();
  const page = await b.ctx.newPage();
  for (const url of sites) {
    const before = b.ctx.pages().length;
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2500);
      await page.mouse.click(300, 300).catch(() => {});       // poke the page like a user would
      await page.waitForTimeout(1200);
      const extra = b.ctx.pages().filter(p => p !== page && !p.url().startsWith('chrome-extension') && p.url() !== 'about:blank');
      const title = await page.title();
      check(`${new URL(url).host}: loads, no extra tabs`, extra.length === 0 && title.length > 0, extra.map(p => p.url()).join() || `"${title.slice(0, 40)}"`);
      for (const p of extra) await p.close().catch(() => {});
    } catch (e) { console.log(`SKIP  ${url}  (${e.message.split('\n')[0]})`); }
  }
  await b.close(); done();
})();
