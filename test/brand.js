// Mirror domains: a site that moves between TLDs (name.fr -> new1.name.cl) must be able to open its own mirror.
const { serve, launch, check, done } = require('./helpers');
(async () => {
  const srv = await serve();
  const b = await launch({ hosts: 'MAP *.mirrorsite.fr 127.0.0.1, MAP *.mirrorsite.cl 127.0.0.1, MAP *.otherthing.fr 127.0.0.1, MAP *.mirrorsite.co.uk 127.0.0.1' });
  const { ctx } = b;
  const page = await ctx.newPage();
  const base = new Set(ctx.pages());
  const others = () => ctx.pages().filter(p => !base.has(p) && !p.url().startsWith('chrome-extension'));
  const opened = async host => { for (let i = 0; i < 25; i++) { if (others().some(p => p.url().includes(host))) return true; await page.waitForTimeout(150); } return false; };
  const go = async () => { await page.goto('http://www.mirrorsite.fr:5599/test/zap.html'); await page.waitForTimeout(500); };
  const openFrom = async url => { await page.evaluate(u => { document.getElementById('link').addEventListener('click', e => { e.preventDefault(); window.open(u); }, { once: true }); }, url); await page.click('#link'); };
  const closeAll = async () => { for (const p of others()) await p.close().catch(() => {}); await page.waitForTimeout(500); };

  await go(); await openFrom('http://new15.mirrorsite.cl:5599/test/zap.html');
  check('site can open its own mirror on another TLD', await opened('new15.mirrorsite.cl')); await closeAll();
  await go(); await openFrom('http://x.mirrorsite.co.uk:5599/test/zap.html');
  check('mirror on a two-part TLD (co.uk) also fine', await opened('mirrorsite.co.uk')); await closeAll();
  await go(); await openFrom('http://ads.otherthing.fr:5599/test/zap.html');
  check('unrelated site on the same TLD is still blocked', !(await opened('otherthing.fr'))); await closeAll();

  await b.close(); srv.close(); done();
})().catch(e => { console.error('ERR', e); process.exit(1); });
