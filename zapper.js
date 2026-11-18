// LiteBlock element zapper. Injected on demand from the popup; nothing runs until then.
// Hover to highlight, click to pick, then Hide. The rule is saved per site and applied
// as plain CSS by site.js on later visits.
(() => {
  'use strict';
  if (window.__lbZap) { window.__lbZap(); return; } // pressing the button again cancels
  if (window !== window.top) return;

  const host = location.hostname.replace(/^www\./, '');
  let current = null, history = [];

  // ---- selector generation: short, stable, unique ---------------------------------
  const BAD_CLASS = /\d{3,}|^(css|sc|jsx|_|js|is|has)[-_]|hover|active|focus|open|show|visible|hidden|loaded|selected/i;
  const goodId = id => /^[a-z][\w-]{1,40}$/i.test(id) && !/\d{3,}/.test(id) && !/[a-f0-9]{8,}/i.test(id);
  const q = s => { try { return document.querySelectorAll(s); } catch (_) { return []; } };

  function part(el) {
    const tag = el.localName;
    if (el.id && goodId(el.id) && q('#' + CSS.escape(el.id)).length === 1) return '#' + CSS.escape(el.id);
    const cls = [...el.classList].filter(c => /^[a-z][\w-]{2,28}$/i.test(c) && !BAD_CLASS.test(c)).slice(0, 2);
    let s = tag + cls.map(c => '.' + CSS.escape(c)).join('');
    const p = el.parentElement;
    if (p) {
      const same = [...p.children].filter(c => c.localName === tag);
      const alike = same.filter(c => c.matches(s));
      if (alike.length > 1) s += `:nth-of-type(${same.indexOf(el) + 1})`;
    }
    return s;
  }
  function fullPath(el) {
    const out = [];
    for (let n = el; n && n.nodeType === 1 && n !== document.documentElement; n = n.parentElement) {
      const same = n.parentElement ? [...n.parentElement.children].filter(c => c.localName === n.localName) : [n];
      out.unshift(`${n.localName}:nth-of-type(${same.indexOf(n) + 1})`);
    }
    return 'html > ' + out.join(' > ');
  }
  const weak = el => !(el.id && goodId(el.id)) && ![...el.classList].some(c => /^[a-z][\w-]{2,28}$/i.test(c) && !BAD_CLASS.test(c));
  function selectorFor(el) {
    let node = el, sel = part(el), forced = weak(el); // a bare tag + index is fragile: always add an anchor
    while ((q(sel).length !== 1 || forced) && node.parentElement && node.parentElement !== document.documentElement) {
      node = node.parentElement; sel = part(node) + ' > ' + sel; forced = false;
    }
    if (q(sel).length === 1 && q(sel)[0] === el) return sel;
    const fp = fullPath(el);
    return q(fp)[0] === el ? fp : null;
  }

  // ---- UI (shadow DOM so page CSS cannot touch it) --------------------------------
  const ui = document.createElement('div');
  ui.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none';
  const sh = ui.attachShadow({ mode: 'open' });
  sh.innerHTML = `<style>
    .box{position:fixed;border:2px solid #2563eb;background:rgba(37,99,235,.18);pointer-events:none;display:none;box-sizing:border-box}
    .bar{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);pointer-events:auto;display:flex;gap:6px;align-items:center;
      background:#17171c;color:#ececf1;font:13px system-ui,sans-serif;padding:8px 10px;border-radius:10px;box-shadow:0 4px 18px rgba(0,0,0,.4)}
    button{font:inherit;color:inherit;background:#2d2d36;border:0;border-radius:6px;padding:5px 10px;cursor:pointer}
    button.go{background:#2563eb}button:disabled{opacity:.4;cursor:default}
    .t{max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#9a9aa6}
  </style><div class="box"></div>
  <div class="bar"><span class="t" id="t">Click an element to hide it</span>
    <button id="up" disabled>Bigger</button><button id="dn" disabled>Smaller</button>
    <button id="go" class="go" disabled>Hide</button><button id="x">Cancel</button></div>`;
  const $ = id => sh.getElementById(id), box = sh.querySelector('.box');
  document.documentElement.append(ui);

  function mark(el) {
    if (!el) { box.style.display = 'none'; return; }
    const r = el.getBoundingClientRect();
    Object.assign(box.style, { display: 'block', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
  }
  const pickable = el => el && el.nodeType === 1 && el !== document.documentElement && el !== document.body && el !== ui;
  function choose(el) {
    current = el; mark(el);
    $('t').textContent = el ? el.localName + (el.id ? '#' + el.id : '') + (el.classList[0] ? '.' + el.classList[0] : '') : 'Click an element to hide it';
    $('go').disabled = !el;
    $('up').disabled = !el || !pickable(el.parentElement);
    $('dn').disabled = !history.length;
  }

  // ---- events ---------------------------------------------------------------------
  const inUi = e => e.composedPath().includes(ui);
  const onMove = e => { if (!current && !inUi(e) && pickable(e.target)) mark(e.target); };
  const swallow = e => { if (!inUi(e)) { e.preventDefault(); e.stopImmediatePropagation(); } };
  const onClick = e => {
    if (inUi(e)) return;
    swallow(e);
    if (pickable(e.target)) { history = []; choose(e.target); }
  };
  const onKey = e => { if (e.key === 'Escape') stop(); };

  function stop() {
    for (const t of ['mousemove']) removeEventListener(t, onMove, true);
    for (const t of ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'auxclick', 'contextmenu']) removeEventListener(t, t === 'click' ? onClick : swallow, true);
    removeEventListener('keydown', onKey, true);
    ui.remove(); delete window.__lbZap;
  }
  window.__lbZap = stop;

  addEventListener('mousemove', onMove, true);
  for (const t of ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'auxclick', 'contextmenu']) addEventListener(t, t === 'click' ? onClick : swallow, true);
  addEventListener('keydown', onKey, true);

  $('x').onclick = stop;
  $('up').onclick = () => { history.push(current); choose(current.parentElement); };
  $('dn').onclick = () => choose(history.pop());
  $('go').onclick = async () => {
    const sel = selectorFor(current);
    if (!sel) { $('t').textContent = 'Could not build a safe selector'; return; }
    const { zaps = {} } = await chrome.storage.local.get('zaps');
    const list = zaps[host] || [];
    if (!list.includes(sel)) list.push(sel);
    zaps[host] = list;
    await chrome.storage.local.set({ zaps });
    const st = document.createElement('style');
    st.setAttribute('data-lb-zap', '');
    st.textContent = `${sel}{display:none!important}`;
    document.documentElement.append(st);
    stop();
  };
})();
