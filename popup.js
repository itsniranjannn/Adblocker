(async () => {
  const $ = id => document.getElementById(id);
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let host = '';
  try { host = new URL(tab.url).hostname.replace(/^www\./, ''); } catch (_) {}
  if (!/^[a-z0-9.-]+\.[a-z]+$/i.test(host)) {
    $('host').textContent = 'This page can’t be filtered.';
    $('toggle').remove(); $('state').textContent = 'n/a';
    return;
  }
  $('host').textContent = host;

  const { paused = [] } = await chrome.storage.local.get('paused');
  const isOff = paused.includes(host);
  $('m').classList.toggle('off', isOff);
  $('state').textContent = isOff ? 'Paused on this site' : 'Blocking on this site';
  $('toggle').textContent = isOff ? 'Resume blocking' : 'Pause on this site';
  $('toggle').onclick = async () => {
    await chrome.runtime.sendMessage({ t: 'toggle', host });
    chrome.tabs.reload(tab.id);
    window.close();
  };

  const key = 'b' + tab.id;
  const list = (await chrome.storage.session.get(key))[key] || [];
  if (list.length) {
    const h = document.createElement('h2');
    h.textContent = `Popups blocked on this page (${list.length})`;
    const ul = document.createElement('ul');
    for (const u of list.slice().reverse()) { const li = document.createElement('li'); li.textContent = u; ul.append(li); }
    $('log').append(h, ul);
  }
})();
