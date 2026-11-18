(async () => {
  const $ = id => document.getElementById(id);
  const el = (tag, text, cls) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
  const send = m => chrome.runtime.sendMessage(m);
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let host = '';
  try { host = new URL(tab.url).hostname.replace(/^www\./, ''); } catch (_) {}
  const local = await chrome.storage.local.get(['paused', 'allowed', 'zaps', 'openOk', 'toast']);
  const paused = local.paused || [], allowed = local.allowed || [], zaps = local.zaps || {}, openOk = local.openOk || [];

  async function render() {
    const log = $('log'); log.textContent = '';
    const sess = await chrome.storage.session.get(['b' + tab.id, 'd' + tab.id, 'diagActive']);

    const pops = sess['b' + tab.id] || [];
    if (pops.length) {
      log.append(el('h2', `Popups blocked on this page (${pops.length})`));
      const ul = el('ul'); for (const u of pops.slice().reverse()) ul.append(el('li', u)); log.append(ul);
    }

    const rows = sess['d' + tab.id];
    if (sess.diagActive === tab.id && !rows) log.append(el('h2', 'Diagnosing… reload the page, then reopen this panel.'));
    if (rows) {
      log.append(el('h2', `Blocked requests on this page (${rows.length} domains)`));
      if (!rows.length) log.append(el('div', 'Nothing was blocked by the network rules.', 'mut'));
      const ul = el('ul');
      for (const [d, n] of rows) {
        const li = el('li'); li.append(el('span', `${d} × ${n}`, 'dom'));
        const b = el('button', allowed.includes(d) ? 'Allowed' : 'Allow', 'sm');
        b.disabled = allowed.includes(d);
        b.onclick = async () => { await send({ t: 'allow', domain: d }); b.textContent = 'Allowed'; b.disabled = true; allowed.push(d); };
        li.append(b); ul.append(li);
      }
      log.append(ul, el('div', 'Reload the page after allowing a domain.', 'mut'));
    }

    const mine = Object.keys(zaps).filter(h => host === h || host.endsWith('.' + h));
    const hidden = mine.flatMap(h => zaps[h].map(s => [h, s]));
    if (hidden.length) {
      log.append(el('h2', `Hidden on this site (${hidden.length})`));
      const ul = el('ul');
      for (const [h, s] of hidden) {
        const li = el('li'); li.append(el('span', s, 'dom'));
        const b = el('button', 'Show', 'sm');
        b.onclick = async () => {
          zaps[h] = zaps[h].filter(x => x !== s); if (!zaps[h].length) delete zaps[h];
          await chrome.storage.local.set({ zaps }); chrome.tabs.reload(tab.id); li.remove();
        };
        li.append(b); ul.append(li);
      }
      log.append(ul);
    }

    if (openOk.length) {
      log.append(el('h2', `Popup targets you allowed (${openOk.length})`));
      const ul = el('ul');
      for (const h of openOk.slice()) {
        const li = el('li'); li.append(el('span', h, 'dom'));
        const b = el('button', 'Remove', 'sm');
        b.onclick = async () => {
          openOk.splice(openOk.indexOf(h), 1);
          await chrome.storage.local.set({ openOk }); li.remove();
        };
        li.append(b); ul.append(li);
      }
      log.append(ul);
    }

    if (allowed.length) {
      log.append(el('h2', `Your allowed domains (${allowed.length})`));
      const ul = el('ul');
      for (const d of allowed) {
        const li = el('li'); li.append(el('span', d, 'dom'));
        const b = el('button', 'Remove', 'sm');
        b.onclick = async () => { await send({ t: 'allow', domain: d }); li.remove(); };
        li.append(b); ul.append(li);
      }
      log.append(ul);
    }
  }

  if (!/^[a-z0-9.-]+$/i.test(host)) {
    $('host').textContent = 'This page can’t be filtered.';
    $('toggle').remove(); $('diag').remove(); $('zap').remove(); $('toast').closest('label').remove(); $('state').textContent = 'n/a';
    return;
  }
  $('host').textContent = host;
  const isOff = paused.includes(host);
  $('m').classList.toggle('off', isOff);
  $('state').textContent = isOff ? 'Paused on this site' : 'Blocking on this site';
  $('toggle').textContent = isOff ? 'Resume blocking' : 'Pause on this site';
  $('toggle').onclick = async () => { await send({ t: 'toggle', host }); chrome.tabs.reload(tab.id); window.close(); };
  $('toast').checked = local.toast !== false;
  $('toast').onchange = () => chrome.storage.local.set({ toast: $('toast').checked });
  $('zap').onclick = async () => {
    try { await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['zapper.js'] }); window.close(); }
    catch (_) { $('zap').textContent = 'Cannot zap on this page'; $('zap').disabled = true; }
  };
  $('diag').onclick = async () => {
    const ok = await send({ t: 'diag', tabId: tab.id });
    if (!ok) { $('diag').textContent = 'Diagnose needs an unpacked install'; $('diag').disabled = true; return; }
    chrome.tabs.reload(tab.id); window.close();
  };
  render();
})();
