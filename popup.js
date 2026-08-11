// Popup Script for Lightweight Ad Blocker

document.addEventListener('DOMContentLoaded', () => {
  const totalBlockedEl = document.getElementById('totalBlocked');
  const adsBlockedEl = document.getElementById('adsBlocked');
  const popupsBlockedEl = document.getElementById('popupsBlocked');
  const ytAdsSkippedEl = document.getElementById('ytAdsSkipped');
  const fbSponsoredRemovedEl = document.getElementById('fbSponsoredRemoved');

  const togglePopupsEl = document.getElementById('togglePopups');
  const toggleYTEl = document.getElementById('toggleYT');
  const toggleFBEl = document.getElementById('toggleFB');
  const resetStatsBtn = document.getElementById('resetStats');

  let currentTotal = 0;

  // Counter-up animation helper
  function animateValue(obj, start, end, duration) {
    if (start === end) return;
    let startTimestamp = null;
    const step = (timestamp) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      const val = Math.floor(progress * (end - start) + start);
      obj.textContent = val.toLocaleString();
      if (progress < 1) {
        window.requestAnimationFrame(step);
      }
    };
    window.requestAnimationFrame(step);
  }

  // Load and update statistics
  function updateUI() {
    chrome.storage.local.get(['stats', 'settings'], (res) => {
      const stats = res.stats || {};
      const settings = res.settings || {};

      const ads = stats.adsBlocked || 0;
      const popups = stats.popupsBlocked || 0;
      const yt = stats.ytAdsSkipped || 0;
      const fb = stats.fbSponsoredRemoved || 0;
      const trackers = stats.trackersBlocked || 0;

      const total = ads + popups + yt + fb + trackers;

      if (total !== currentTotal) {
        animateValue(totalBlockedEl, currentTotal, total, 400);
        currentTotal = total;
      }

      adsBlockedEl.textContent = ads.toLocaleString();
      popupsBlockedEl.textContent = popups.toLocaleString();
      ytAdsSkippedEl.textContent = yt.toLocaleString();
      fbSponsoredRemovedEl.textContent = fb.toLocaleString();

      if (settings.blockPopups !== undefined) togglePopupsEl.checked = settings.blockPopups;
      if (settings.ytAutoSkip !== undefined) toggleYTEl.checked = settings.ytAutoSkip;
      if (settings.fbCleaner !== undefined) toggleFBEl.checked = settings.fbCleaner;
    });
  }

  // Toggles
  togglePopupsEl.addEventListener('change', (e) => saveSetting('blockPopups', e.target.checked));
  toggleYTEl.addEventListener('change', (e) => saveSetting('ytAutoSkip', e.target.checked));
  toggleFBEl.addEventListener('change', (e) => saveSetting('fbCleaner', e.target.checked));

  function saveSetting(key, val) {
    chrome.storage.local.get(['settings'], (res) => {
      const settings = res.settings || {};
      settings[key] = val;
      chrome.storage.local.set({ settings });
    });
  }

  // Reset
  resetStatsBtn.addEventListener('click', () => {
    resetStatsBtn.style.transform = 'scale(0.96)';
    setTimeout(() => resetStatsBtn.style.transform = 'none', 150);

    const emptyStats = {
      adsBlocked: 0,
      popupsBlocked: 0,
      ytAdsSkipped: 0,
      fbSponsoredRemoved: 0,
      trackersBlocked: 0
    };
    currentTotal = 0;
    chrome.storage.local.set({ stats: emptyStats }, () => {
      updateUI();
    });
  });

  updateUI();
  setInterval(updateUI, 1000);
});
