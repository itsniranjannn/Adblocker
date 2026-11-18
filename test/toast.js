// Allow-once toast: shows only for likely-wanted popups, opens exactly once, never spams.
const { serve, launch, check, done } = require('./helpers');
const BASE = 'http://localhost:5599';

(async () => {
  const srv = await serve();
  const b = await launch(); const { ctx, sw } = b;
  const page = await ctx.newPage();
  await page.goto(`${BASE}/test/popups.html`); await page.waitForTimeout(600);
  const tabId = await sw.evaluate(async () => (await chrome.tabs.query({ url: 'http://localhost/*' }))[0].id);
  const resetGap = () => sw.evaluate(id => chrome.storage.session.remove('tt' + id), tabId);
  const toast = () => page.locator('[data-lb-toast]').count();
  const base = new Set(ctx.pages());   // tabs that existed before any popup (incl. the initial blank tab)
  const others = () => ctx.pages().filter(p => !base.has(p) && !p.url().startsWith('chrome-extension'));
  const opened = async prefix => { for (let i = 0; i < 40; i++) { if (others().some(p => p.url().startsWith(prefix))) return true; await page.waitForTimeout(150); } return false; };
  const closeOthers = async () => { for (const p of others()) await p.close().catch(() => {}); };
  const cross = async () => { await page.click('#cross'); await page.waitForTimeout(900); };

  // 1. silent cases: on-load popup (no click) and a clickunder on the page body
  check('no toast for the on-load popup', (await toast()) === 0);
  await page.evaluate(() => { window.__armed = true; });
  await page.mouse.click(600, 400); await page.waitForTimeout(900);
  check('no toast for a clickunder on the body', (await toast()) === 0 && others().length === 0);
  await page.evaluate(() => { window.__armed = false; });

  // 2. a button click that opens another site: toast appears, nothing opened yet
  await resetGap(); await cross();
  check('toast shown after a real button click', (await toast()) === 1);
  check('toast names the target host', (await page.locator('[data-lb-toast] #h').textContent()) === 'example.com');
  check('popup still blocked until you choose', others().length === 0);

  // 3. Allow once opens exactly that URL, once
  await page.locator('[data-lb-toast] #once').click();
  check('Allow once opens the blocked URL, once', (await opened('https://example.com/?btn')) && others().length === 1, others().map(p => p.url()).join());
  check('toast closes after choosing', (await toast()) === 0);
  await closeOthers();
  await resetGap(); await cross();
  check('allow-once is not permanent (blocked again next time)', others().length === 0);

  // 4. rate limit: a second blocked click right away shows no new toast
  await page.locator('[data-lb-toast] #x').click(); await page.waitForTimeout(200);
  await cross();
  check('no second toast within the rate limit', (await toast()) === 0);

  // 5. hostile / malformed requests never produce a toast
  await resetGap();
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('__lb_blocked', { detail: JSON.stringify({ u: 'javascript:alert(1)', t: 1 }) })));
  await page.waitForTimeout(600);
  check('javascript: URL gets no toast', (await toast()) === 0);
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('__lb_blocked', { detail: 'not json' })));
  await page.waitForTimeout(400);
  check('malformed event ignored', (await toast()) === 0);

  // 6. setting off -> silent
  await sw.evaluate(() => chrome.storage.local.set({ toast: false })); await resetGap(); await cross();
  check('notices can be turned off', (await toast()) === 0);
  await sw.evaluate(() => chrome.storage.local.remove('toast'));

  // 7. Always allow: opens now, and future clicks open directly with no toast
  await resetGap(); await cross();
  await page.locator('[data-lb-toast] #al').click();
  check('Always allow opens the URL', await opened('https://example.com/?btn'));
  const ok = await sw.evaluate(async () => (await chrome.storage.local.get('openOk')).openOk || []);
  check('target host remembered', ok.includes('example.com'), JSON.stringify(ok));
  await closeOthers();
  await page.reload(); await page.waitForTimeout(700);
  await resetGap(); await page.click('#cross');
  check('remembered host opens directly, no toast', (await opened('https://example.com/?btn')) && (await toast()) === 0);
  await closeOthers();
  await sw.evaluate(() => chrome.storage.local.remove('openOk'));
  await page.reload(); await page.waitForTimeout(700);
  await resetGap(); await cross();
  check('removing it restores blocking', others().length === 0);

  await b.close(); srv.close(); done();
})().catch(e => { console.error('ERR', e); process.exit(1); });
