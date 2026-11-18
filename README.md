# LiteBlock

Lightweight Manifest V3 ad / popup / popunder blocker for Chrome, Edge and Brave.

## Install
1. Open `chrome://extensions` (or `edge://extensions`), turn on **Developer mode**.
2. **Load unpacked** and pick this folder.
3. Pin the icon. Its badge counts blocked requests per tab; the popup shows blocked popups and lets you pause a site.

## How it stays light
| Layer | Mechanism | Idle cost |
|---|---|---|
| Ads / trackers | `declarativeNetRequest`, ~102k ad domains (EasyList, EasyPrivacy, Peter Lowe) matched by the browser itself | none (no JS) |
| Tracking links | `utm_*`, `fbclid`, `gclid`... stripped natively | none (no JS) |
| Banner slots | `cosmetic.css`, specific selectors only | none (no JS) |
| Popups / popunders | `shield.js` wraps `window.open` and checks clicks at click time | none (no timers, no observers) |
| YouTube | strips ad data from player responses, one attribute observer as fallback | negligible |

## Popup rules (shield.js)
- No real user click: `window.open` is blocked.
- Cross-site targets are blocked, except sign-in, share and payment hosts in `OK_HOSTS`.
- Script-made `<a target=_blank>.click()` and invisible full-page click-catching links are blocked.
- A tab opened from another tab whose load gets blocked is closed automatically. Tabs you open yourself are never touched.
- A legitimate popup got blocked? Open the icon, see it listed, press **Pause on this site**, or add its host to `OK_HOSTS`.

## Blocked a popup you wanted?
When you click a button or link and the page tries to open another site, a small notice appears: **Allow once** opens it now, **Always allow** remembers that target site, **Dismiss** ignores it. Nothing is shown for ads that fire on their own (page load, timers, invisible overlays, clickunders), at most one notice per 15 seconds, and it can be switched off in the icon panel. Remembered targets are listed there and removable.

## Zap an element
An ad slipped through? Open the icon, press **Zap an element**, hover to highlight, click it, then **Hide**. **Bigger** / **Smaller** move up and down the page structure; **Esc** cancels. Links and buttons do nothing while you pick.
The rule is saved for that site and applied as plain CSS on later visits (no scanning). Class names that look auto-generated are ignored so rules survive site updates. Undo from the icon: **Hidden on this site**, then **Show**.

## Site broken? Diagnose
Open the icon, press **Site broken? Diagnose**; the page reloads and records which domains get blocked (for two minutes only, then it stops listening). Reopen the icon, press **Allow** next to the culprit, reload. Your allowed domains are listed and removable in the same panel. Diagnose needs the unpacked install.

## Update the filter lists
```
npm run rules          # downloads the lists and rebuilds rules/ads.json
```
`build/allow.txt` lists domains that must never be blocked; `build/seed_domains.txt` is the original hand-collected list. Only plain domain rules are used, so matching stays native and fast.

## Tests
```
npm install
npm test               # rules checks + real-browser popup / diagnose / pause / zapper / notice tests (Edge or Chrome)
npm run test:sites     # loads the sites in test/sites.json, fails on stray tabs (edit the list)
npm run bench          # page load, heap and idle CPU with vs without the extension
```
Set `BROWSER_PATH` if Edge/Chrome is installed somewhere unusual.
