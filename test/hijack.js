// Current-tab hijack guard: blocks the clickunder pattern, leaves real navigation alone.
const { serve, launch, check, done } = require('./helpers');
const BASE = 'http://localhost:5599';
(async () => {
  const srv = await serve();
  const b = await launch(); const { ctx, sw } = b;
  const page = await ctx.newPage();
  const url = () => page.url();
  const fresh = async () => { await page.goto(`${BASE}/test/popups.html`); await page.waitForTimeout(500); };

  await fresh();
  await page.evaluate(() => { window.__nav = true; });
  await page.mouse.click(700, 450); await page.waitForTimeout(1200);
  check('body click cannot send this tab to an ad', url().startsWith(BASE), url());

  await fresh();
  await page.click('#navbtn'); await page.waitForTimeout(2500);
  check('button that navigates this tab still works', url().startsWith('https://example.org'), url());

  await fresh();
  await page.evaluate(() => { location.href = 'https://example.org/?timer'; }); await page.waitForTimeout(2500);
  check('script redirect with no real click (SSO-style) is left alone', url().startsWith('https://example.org'), url());

  await fresh();
  await page.click('#xlegit'); await page.waitForTimeout(1500);
  check('ordinary user link click unaffected', ctx.pages().some(p => p.url().startsWith('https://example.org')));

  await fresh();
  await sw.evaluate(id => chrome.storage.session.clear(), 0);
  await page.click('#card'); await page.waitForTimeout(1000);
  check('clickable card counts as a control (notice offered)', (await page.locator('[data-lb-toast]').count()) === 1);

  await b.close(); srv.close(); done();
})().catch(e => { console.error('ERR', e); process.exit(1); });
