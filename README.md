# LiteBlock

Lightweight Manifest V3 ad / popup / popunder blocker for Chrome, Edge and Brave.

## Install
1. Open `chrome://extensions` (or `edge://extensions`), turn on **Developer mode**.
2. **Load unpacked** and pick this folder.
3. Pin the icon. Its badge counts blocked requests per tab; the popup shows blocked popups and lets you pause a site.

## How it stays light
| Layer | Mechanism | Idle cost |
|---|---|---|
| Ads / trackers | `declarativeNetRequest`, 26.7k ad domains matched by the browser itself | none (no JS) |
| Banner slots | `cosmetic.css`, specific selectors only | none (no JS) |
| Popups / popunders | `shield.js` wraps `window.open` and checks clicks at click time | none (no timers, no observers) |
| YouTube | strips ad data from player responses, one attribute observer as fallback | negligible |

## Popup rules (shield.js)
- No real user click: `window.open` is blocked.
- Cross-site targets are blocked, except sign-in, share and payment hosts in `OK_HOSTS`.
- Script-made `<a target=_blank>.click()` and invisible full-page click-catching links are blocked.
- A tab opened from another tab whose load gets blocked is closed automatically. Tabs you open yourself are never touched.
- A legitimate popup got blocked? Open the icon, see it listed, press **Pause on this site**, or add its host to `OK_HOSTS`.

## Rebuild the rule list
`python build/build_rules.py <old rules.json>`; to add domains, extend the list in that script.

## Test
`test/popups.html` has every popup trick; serve the folder (`python -m http.server`) and open `/test/popups.html`.
