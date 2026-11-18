// Allow-once toast. Defined here, run by the background through scripting.executeScript({ func })
// in the top frame only when a likely-wanted popup was blocked. Must stay self-contained.
function lbToast(url) {
  const old = document.querySelector('[data-lb-toast]');
  if (old) old.remove();
  let u; try { u = new URL(url); } catch (_) { return; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return;

  const host = document.createElement('div');
  host.setAttribute('data-lb-toast', '');
  host.style.cssText = 'all:initial;position:fixed;right:16px;bottom:16px;z-index:2147483647';
  const sh = host.attachShadow({ mode: 'open' });
  sh.innerHTML = `<style>
    .t{display:flex;flex-direction:column;gap:8px;max-width:320px;background:#17171c;color:#ececf1;font:13px system-ui,sans-serif;
       padding:12px 14px;border-radius:10px;box-shadow:0 4px 18px rgba(0,0,0,.4)}
    .m{line-height:1.35;word-break:break-all} .m b{color:#fff}
    .r{display:flex;gap:6px;justify-content:flex-end}
    button{font:inherit;color:inherit;background:#2d2d36;border:0;border-radius:6px;padding:5px 10px;cursor:pointer}
    button.go{background:#2563eb}
  </style><div class="t"><div class="m">LiteBlock blocked a popup to <b id="h"></b></div>
    <div class="r"><button id="x">Dismiss</button><button id="al">Always allow</button><button id="once" class="go">Allow once</button></div></div>`;
  sh.getElementById('h').textContent = u.hostname;      // text only: the URL comes from the page
  const open = () => window.open(u.href, '_blank', 'noopener'); // runs inside this click's user activation
  sh.getElementById('once').onclick = () => { open(); host.remove(); };
  sh.getElementById('al').onclick = () => {
    try { chrome.runtime.sendMessage({ t: 'openok', host: u.hostname.replace(/^www\./, '') }); } catch (_) {}
    open(); host.remove();
  };
  sh.getElementById('x').onclick = () => host.remove();
  document.documentElement.append(host);
  setTimeout(() => host.remove(), 9000);
}
