// The hidden-form / fresh-iframe popunder tricks used by streaming-site ad scripts.
const { serve, launch, check, done } = require('./helpers');
const BASE = 'http://localhost:5599';
(async () => {
  const srv = await serve();
  const b = await launch(); const { ctx } = b;
  const page = await ctx.newPage();
  const base = new Set(ctx.pages());
  const others = () => ctx.pages().filter(p => !base.has(p) && !p.url().startsWith('chrome-extension'));
  const closeAll = async () => { for (const p of others()) await p.close().catch(() => {}); };
  const opened = async prefix => { for (let i = 0; i < 25; i++) { if (others().some(p => p.url().startsWith(prefix))) return true; await page.waitForTimeout(150); } return false; };
  const fresh = async mode => { await page.goto(`${BASE}/test/popunder.html`); await page.waitForTimeout(500); await page.evaluate(m => { window.__mode = m; }, mode); };

  for (const [mode, name] of [['form', 'hidden form submitted by script'], ['iframe', 'window.open from a fresh iframe'],
                              ['reqsubmit', 'hidden form via requestSubmit'], ['btnclick', 'script click on hidden submit button']]) {
    await fresh(mode); await page.mouse.click(700, 500); await page.waitForTimeout(3000);
    check(`${name}: blocked`, others().length === 0, others().map(p => p.url()).join());
    await closeAll(); await page.waitForTimeout(1500); await closeAll();   // drain late tabs so they are not blamed on the next trick
  }

  await fresh('');
  await page.click('#legitsubmit');
  check('legit visible same-site form to new tab still opens', await opened(`${BASE}/test/popunder.html?legit`)); await closeAll();
  await fresh('');
  await page.click('#xsubmit');
  check('user-submitted visible form to another site still opens', await opened('https://example.com/')); await closeAll();

  await b.close(); srv.close(); done();
})().catch(e => { console.error('ERR', e); process.exit(1); });
