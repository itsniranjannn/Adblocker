// End-to-end: loads the extension into a real Edge/Chrome and exercises every popup trick.
const { serve, launch, check, done } = require('./helpers');
const BASE = 'http://localhost:5599';

(async () => {
  const srv = await serve();
  const b = await launch();
  const { ctx, sw } = b;
  const page = await ctx.newPage();
  const tabs = () => ctx.pages().filter(p => p !== page && !p.url().startsWith('chrome-extension') && p.url() !== 'about:blank' && p.url() !== '');
  const settle = async () => { await page.waitForTimeout(900); };
  const reset = async () => { for (const p of tabs()) await p.close().catch(() => {}); };

  const rs = await sw.evaluate(async () => ({
    enabled: await chrome.declarativeNetRequest.getEnabledRulesets(),
    left: await chrome.declarativeNetRequest.getAvailableStaticRuleCount() }));
  check('static ruleset enabled', rs.enabled.includes('ads'), JSON.stringify(rs));

  await page.goto(`${BASE}/test/popups.html`); await settle();
  check('popup on load blocked', tabs().length === 0, tabs().map(p => p.url()).join());
  await page.click('#same'); await settle();
  check('same-site button popup allowed', tabs().some(p => p.url().includes('?same'))); await reset();
  await page.click('#cross'); await settle();
  check('cross-site button popup blocked', tabs().length === 0, tabs().map(p => p.url()).join()); await reset();
  await page.click('#legit'); await settle();
  check('user-clicked same-site link allowed', tabs().some(p => p.url().includes('?legit'))); await reset();
  await page.click('#xlegit'); await settle();
  check('user-clicked external link allowed', tabs().some(p => p.url().startsWith('https://example.org'))); await reset();
  await page.evaluate(() => { window.__armed = true; });
  await page.mouse.click(600, 400); await settle();
  check('clickunder blocked', tabs().length === 0, tabs().map(p => p.url()).join()); await reset();
  await page.evaluate(() => synth()); await settle();
  check('synthetic anchor click blocked', tabs().length === 0); await reset();
  await page.evaluate(() => overlay()); await page.mouse.click(500, 300); await settle();
  check('invisible overlay click blocked', tabs().length === 0, tabs().map(p => p.url()).join()); await reset();

  const net = await page.evaluate(async () => {
    const t = u => fetch(u, { mode: 'no-cors' }).then(() => 'LOADED', () => 'BLOCKED');
    return { ad: await t('https://ad.doubleclick.net/x.js'), tracker: await t('https://www.google-analytics.com/analytics.js'), ok: await t('https://example.com/') };
  });
  check('ad domain blocked', net.ad === 'BLOCKED'); check('allow-listed analytics not blocked', net.tracker === 'LOADED');
  check('normal site loads', net.ok === 'LOADED');

  await page.goto(`${BASE}/test/popups.html?utm_source=x&fbclid=abc&keep=1`); await settle();
  check('tracking params stripped, others kept', page.url().includes('keep=1') && !/utm_source|fbclid/.test(page.url()), page.url());

  const pop = await ctx.newPage(); await pop.goto(`chrome-extension://${b.extId}/popup.html`);
  check('popup UI renders', (await pop.textContent('h1')) === 'LiteBlock');

  await b.close(); srv.close(); done();
})().catch(e => { console.error('ERR', e); process.exit(1); });
