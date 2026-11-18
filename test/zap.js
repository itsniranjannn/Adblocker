// Element zapper: pick, hide, persist, cancel, undo. Real browser.
const { serve, launch, check, done } = require('./helpers');
const URL_ = 'http://localhost:5599/test/zap.html';

(async () => {
  const srv = await serve();
  const b = await launch(); const { ctx, sw } = b;
  const page = await ctx.newPage();
  await page.goto(URL_); await page.waitForTimeout(500);
  const tabId = await sw.evaluate(async () => (await chrome.tabs.query({ url: 'http://localhost/*' }))[0].id);
  const inject = () => sw.evaluate(id => chrome.scripting.executeScript({ target: { tabId: id }, files: ['zapper.js'] }), tabId);
  const shown = sel => page.evaluate(s => { const e = document.querySelector(s); return !!e && e.getClientRects().length > 0; }, sel);
  const zaps = () => sw.evaluate(async () => (await chrome.storage.local.get('zaps')).zaps || {});
  const centre = async sel => { const r = await page.locator(sel).boundingBox(); return [r.x + r.width / 2, r.y + r.height / 2]; };
  const click = async sel => { const [x, y] = await centre(sel); await page.mouse.move(x, y); await page.mouse.click(x, y); };
  const hasUi = () => page.evaluate(() => [...document.documentElement.children].some(e => e.shadowRoot));

  // 1. picker is inert: clicking a link while picking must not navigate
  await inject(); await page.waitForTimeout(300);
  check('picker UI appears', await hasUi());
  await click('#link'); await page.waitForTimeout(400);
  check('link click while picking does not navigate', page.url() === URL_);

  // 2. pick the 3rd list item and hide it
  await click('#victim');
  await page.locator('button#go').click(); await page.waitForTimeout(300);
  check('picked element hidden', !(await shown('#victim')));
  check('similar siblings stay visible', await page.evaluate(() => [...document.querySelectorAll('.item')].filter(e => e.id !== 'victim').every(e => getComputedStyle(e).display !== 'none')));
  check('picker UI removed after hiding', !(await hasUi()));
  const z1 = (await zaps()).localhost || [];
  check('selector saved and unique', z1.length === 1 && await page.evaluate(s => document.querySelectorAll(s).length === 1, z1[0]), z1[0]);

  // 3. persists after reload (applied by site.js, no picker involved)
  await page.reload(); await page.waitForTimeout(500);
  check('zap persists after reload', !(await shown('#victim')) && await shown('#promo-box'));

  // 4. auto-generated class names are not used in the selector
  await inject(); await click('.css-1x9fz2a'); await page.locator('button#go').click(); await page.waitForTimeout(300);
  const z2 = (await zaps()).localhost || [];
  check('hashed class not used in selector', z2.length === 2 && !z2[1].includes('css-1x9'), z2[1]);
  check('class-less selector is anchored to a parent', /^body > |#|\./.test(z2[1]) && z2[1].includes('>'), z2[1]);
  check('hashed-class element hidden, others intact', !(await shown('.css-1x9fz2a')) && await shown('#promo-box') && await shown('.deep'));

  // 5. Bigger selects the parent
  await inject(); await click('.deep'); await page.locator('button#up').click(); await page.locator('button#go').click(); await page.waitForTimeout(300);
  check('Bigger hides the parent wrapper', !(await shown('.deep')) && await shown('#promo-box'));

  // 6. Escape cancels and saves nothing
  const before = (await zaps()).localhost.length;
  await inject(); await click('#promo-box'); await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  check('Escape cancels, nothing saved', !(await hasUi()) && (await zaps()).localhost.length === before && await shown('#promo-box'));

  // 7. undo (what the popup "Show" button does) brings everything back
  await sw.evaluate(() => chrome.storage.local.remove('zaps'));
  await page.reload(); await page.waitForTimeout(500);
  check('removing zaps restores the page', await shown('#victim') && await shown('.css-1x9fz2a') && await shown('.deep'));

  await b.close(); srv.close(); done();
})().catch(e => { console.error('ERR', e); process.exit(1); });
