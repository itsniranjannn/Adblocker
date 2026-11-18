// Cost of LiteBlock: same pages, with and without the extension.
// Reports page-load time, main-thread task time, JS heap and idle CPU (5 s of doing nothing).
const { serve, launch } = require('./helpers');
const PAGES = ['http://localhost:5599/test/popups.html', 'https://en.wikipedia.org/wiki/Advertising', 'https://www.bbc.com/news'];

async function run(extension) {
  const b = await launch({ extension });
  const page = await b.ctx.newPage();
  const cdp = await b.ctx.newCDPSession(page);
  await cdp.send('Performance.enable');
  const rows = [];
  for (const url of PAGES) {
    try {
      const t0 = Date.now();
      await page.goto(url, { waitUntil: 'load', timeout: 45000 });
      const load = Date.now() - t0;
      const m1 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(x => [x.name, x.value]));
      await page.waitForTimeout(5000);
      const m2 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(x => [x.name, x.value]));
      rows.push({ url: new URL(url).host + new URL(url).pathname.slice(0, 18), load, heapMB: +(m2.JSHeapUsedSize / 1e6).toFixed(1),
        idleCpuMs: +((m2.TaskDuration - m1.TaskDuration) * 1000).toFixed(0), nodes: m2.Nodes });
    } catch (e) { rows.push({ url, error: e.message.split('\n')[0] }); }
  }
  await b.close();
  return rows;
}
(async () => {
  const srv = await serve();
  const off = await run(false), on = await run(true);
  srv.close();
  console.log('\npage'.padEnd(34), 'load ms off/on'.padEnd(18), 'heap MB off/on'.padEnd(17), 'idle CPU ms/5s off/on');
  off.forEach((o, i) => { const n = on[i];
    if (o.error || n.error) return console.log(o.url.padEnd(33), 'error', o.error || n.error);
    console.log(o.url.padEnd(33), `${o.load}/${n.load}`.padEnd(18), `${o.heapMB}/${n.heapMB}`.padEnd(17), `${o.idleCpuMs}/${n.idleCpuMs}`); });
})();
