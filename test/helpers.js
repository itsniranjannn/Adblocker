// Shared test helpers: static server + Edge/Chromium launcher with LiteBlock loaded.
const { chromium } = require('playwright-core');
const http = require('http'), fs = require('fs'), os = require('os'), path = require('path');
const EXT = path.resolve(__dirname, '..');
const BROWSERS = [process.env.BROWSER_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe'].filter(Boolean);
const exe = BROWSERS.find(p => fs.existsSync(p));
if (!exe) throw new Error('No Edge/Chrome found. Set BROWSER_PATH.');

function serve(port = 5599) {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };
  return new Promise(res => {
    const s = http.createServer((q, r) => {
      const f = path.join(EXT, decodeURIComponent(q.url.split('?')[0]));
      if (f.startsWith(EXT) && fs.existsSync(f) && fs.statSync(f).isFile()) {
        r.setHeader('content-type', types[path.extname(f)] || 'text/plain'); r.end(fs.readFileSync(f));
      } else { r.statusCode = 404; r.end('x'); }
    }).listen(port, () => res(s));
  });
}

async function launch({ extension = true, headless = false, safe = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'liteblock-'));
  const args = extension ? [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`,
    '--disable-features=DisableLoadExtensionCommandLineSwitch'] : [];
  const ctx = await chromium.launchPersistentContext(dir, { executablePath: exe, headless, args, acceptDownloads: !safe, permissions: [] });
  let sw = null;
  if (extension) {
    sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 10000 });
  }
  return { ctx, sw, extId: sw ? new URL(sw.url()).host : null, close: async () => { await ctx.close(); fs.rmSync(dir, { recursive: true, force: true }); } };
}

let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); if (!ok) failed++; };
const done = () => { console.log(failed ? `\n${failed} FAILED` : '\nall passed'); process.exit(failed ? 1 : 0); };
module.exports = { EXT, serve, launch, check, done };
