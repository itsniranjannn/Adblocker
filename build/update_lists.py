#!/usr/bin/env python3
"""Builds rules/ads.json from maintained filter lists.

    python build/update_lists.py            # download lists, rebuild
    python build/update_lists.py --offline  # rebuild from build/cache

Only plain domain rules are accepted (||domain^ with harmless options). Anything with a
path, a domain= condition or an exception is skipped on purpose: it keeps matching native,
fast and free of substring false positives. Subdomains are folded into their parent.
"""
import json, re, sys, time, urllib.request, pathlib, datetime

ROOT = pathlib.Path(__file__).resolve().parent.parent
BUILD = ROOT / 'build'
CACHE = BUILD / 'cache'
SOURCES = {
    'peter-lowe': 'https://pgl.yoyo.org/adservers/serverlist.php?hostformat=nohtml&showintro=0',
    'easylist':   'https://easylist.to/easylist/easylist.txt',
    'easyprivacy':'https://easylist.to/easylist/easyprivacy.txt',
}
OK_OPTS = {'third-party','3p','popup','script','image','stylesheet','xmlhttprequest','xhr','subdocument',
           'ping','media','font','object','other','important','all'}
LINE = re.compile(r'^\|\|([a-z0-9][a-z0-9.-]*\.[a-z0-9-]{2,})\^(?:\$([a-z0-9,~=_-]+))?$')
HOST = re.compile(r'^[a-z0-9][a-z0-9.-]*\.[a-z0-9-]{2,}$')
# Big sites that must stay reachable; a blocked parent of any of these is removed.
PROTECTED = ['google.com','youtube.com','facebook.com','instagram.com','twitter.com','x.com','github.com','microsoft.com',
    'live.com','office.com','apple.com','amazon.com','wikipedia.org','reddit.com','linkedin.com','netflix.com','whatsapp.com',
    'paypal.com','stripe.com','cloudflare.com','discord.com','twitch.tv','spotify.com','zoom.us','slack.com','dropbox.com',
    'gmail.com','yahoo.com','bing.com','duckduckgo.com','stackoverflow.com','medium.com','tiktok.com','telegram.org']
ALL = ["main_frame","sub_frame","script","image","stylesheet","object","xmlhttprequest","font","media","websocket","ping","other"]

def under(d, root): return d == root or d.endswith('.' + root)

def fetch(name, url, offline):
    CACHE.mkdir(exist_ok=True)
    f = CACHE / f'{name}.txt'
    if not offline:
        req = urllib.request.Request(url, headers={'User-Agent': 'LiteBlock-build/1.0'})
        f.write_bytes(urllib.request.urlopen(req, timeout=60).read())
    return f.read_text('utf-8', 'ignore').splitlines()

def parse_plain(lines):
    return {l.strip().lower() for l in lines if HOST.match(l.strip().lower())}

def parse_abp(lines):
    out = set()
    for l in lines:
        l = l.strip().lower()
        m = LINE.match(l)
        if not m: continue
        opts = (m.group(2) or '').split(',') if m.group(2) else []
        if any(o not in OK_OPTS for o in opts if o): continue
        out.add(m.group(1))
    return out

def main():
    offline = '--offline' in sys.argv
    sets, stats = {}, {}
    seed = BUILD / 'seed_domains.txt'
    sets['seed'] = parse_plain(l for l in seed.read_text().splitlines() if not l.startswith('#'))
    for name, url in SOURCES.items():
        lines = fetch(name, url, offline)
        sets[name] = parse_plain(lines) if name == 'peter-lowe' else parse_abp(lines)
    allow = [l.strip().lower() for l in (BUILD / 'allow.txt').read_text().splitlines() if l.strip() and not l.startswith('#')]
    merged = set().union(*sets.values())
    stats['raw'] = {k: len(v) for k, v in sets.items()}
    merged = {d for d in merged if not any(under(d, a) for a in allow)}
    # never block a parent of a protected site
    hit = sorted(d for d in merged if any(under(p, d) for p in PROTECTED))
    if hit: print('removed protected parents:', hit)
    merged -= set(hit)
    # fold subdomains into blocked parents
    final = []
    for d in sorted(merged, key=lambda s: (s.count('.'), s)):
        parts = d.split('.')
        if any('.'.join(parts[i:]) in merged and '.'.join(parts[i:]) != d for i in range(1, len(parts) - 1)): continue
        final.append(d)
    final.sort()
    rules, rid = [], 1
    for i in range(0, len(final), 2500):
        rules.append({"id": rid, "priority": 1, "action": {"type": "block"},
                      "condition": {"requestDomains": final[i:i+2500], "resourceTypes": ALL}}); rid += 1
    for f in ["||youtube.com/pagead/", "||youtube.com/api/stats/ads", "||youtube.com/get_midroll_"]:
        rules.append({"id": rid, "priority": 1, "action": {"type": "block"},
                      "condition": {"urlFilter": f, "resourceTypes": ["xmlhttprequest","image","script","ping","other","media"]}}); rid += 1
    # tracking parameters stripped natively on top-level navigations
    rules.append({"id": rid, "priority": 1, "action": {"type": "redirect", "redirect": {"transform": {"queryTransform": {
        "removeParams": ["fbclid","gclid","dclid","msclkid","mc_eid","igshid","utm_source","utm_medium","utm_campaign","utm_term","utm_content","utm_id","yclid"]}}}},
        "condition": {"resourceTypes": ["main_frame"], "regexFilter": "^https?://[^/]+/.*[?&](fbclid|gclid|dclid|msclkid|mc_eid|igshid|yclid|utm_[a-z_]+)="}})
    out = ROOT / 'rules' / 'ads.json'
    out.write_text(json.dumps(rules, separators=(',', ':')))
    stats.update(domains=len(final), rules=len(rules), bytes=out.stat().st_size,
                 built=datetime.date.today().isoformat(), sources=list(SOURCES))
    (BUILD / 'last_build.json').write_text(json.dumps(stats, indent=2) + '\n')
    print(json.dumps(stats, indent=2))

if __name__ == '__main__': main()
