<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&height=120&color=0:0d1117,50:1e3a8a,100:3b82f6&section=header&text=LiteBlock&fontSize=44&fontColor=ffffff&fontAlignY=38" width="100%" alt="LiteBlock Header"/>

<a href="https://github.com/itsniranjannn/Adblocker">
  <img src="https://readme-typing-svg.demolab.com?font=Poppins&weight=600&size=21&duration=2800&pause=900&color=60A5FA&center=true&vCenter=true&width=680&lines=Lightweight+Manifest+V3+Adblocker.;~102k+ad+%26+tracker+domains+blocked+natively.;Zero+idle+CPU+popup+%26+popunder+shield.;Element+Zapper+%2B+Site+Broken+Diagnose." alt="Typing animation"/>
</a>

<br/>

![Manifest V3](https://img.shields.io/badge/Manifest-V3-3b82f6?style=for-the-badge&logo=googlechrome&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![Browsers](https://img.shields.io/badge/Chrome_|_Edge_|_Brave-1f2937?style=for-the-badge)

<br/>

**[Overview](#overview) · [Architecture](#how-it-stays-light) · [Install](#install) · [Testing](#tests) · [Connect](#connect)**

</div>

---

## Overview

**LiteBlock** is a lightweight Manifest V3 ad, tracker, popup, and popunder blocker for **Chrome, Edge, and Brave**. It offloads domain blocking to the browser's native `declarativeNetRequest` engine so idle CPU and memory overhead stay near zero.

---

## How It Stays Light

| Layer | Mechanism | Idle Cost |
| :--- | :--- | :--- |
| **Ads & Trackers** | `declarativeNetRequest` (~102k domains: EasyList, EasyPrivacy, Peter Lowe) | None (no JS) |
| **Tracking Links** | `utm_*`, `fbclid`, `gclid` stripped natively | None (no JS) |
| **Banner Slots** | `cosmetic.css` with specific selectors only | None (no JS) |
| **Popups / Popunders** | `shield.js` wraps `window.open` and validates real user clicks | None (no timers) |
| **YouTube** | Prunes ad data from player responses + fallback observer | Negligible |

---

<details>
<summary><b>Install & Tests (click to expand)</b></summary>

### Install (Unpacked)
1. Open `chrome://extensions` (or `edge://extensions`) and enable **Developer mode**.
2. Click **Load unpacked** and select this folder.
3. Pin the icon to view per-tab blocked counts, **Zap an element**, or **Diagnose** broken sites.

### Tests
```bash
npm install
npm test             # Rules checks + real-browser popup/zapper/diagnose tests
npm run test:sites   # Smoke-tests sites in test/sites.json
npm run bench        # Page load, heap, and idle CPU benchmark
```

</details>

---

## Connect

<div align="center">

<a href="mailto:katwalniranjan7@gmail.com"><img src="https://img.shields.io/badge/katwalniranjan7%40gmail.com-D14836?style=for-the-badge&logo=gmail&logoColor=white" alt="Email"/></a>
<a href="https://github.com/itsniranjannn"><img src="https://img.shields.io/badge/itsniranjannn-181717?style=for-the-badge&logo=github&logoColor=white" alt="GitHub"/></a>

<img src="https://capsule-render.vercel.app/api?type=waving&height=80&color=0:0d1117,50:1e3a8a,100:3b82f6&section=footer" width="100%" alt=""/>

</div>
