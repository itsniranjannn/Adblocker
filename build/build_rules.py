"""Builds rules/ads.json from a domain list. Domain-only matching (requestDomains) = fast and no substring false positives."""
import json, re, sys, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
old = pathlib.Path(sys.argv[1])           # old rules.json
NEVER = {'google.com','googleapis.com','gstatic.com','youtube.com','facebook.com','microsoft.com','amazon.com',
         'akamaihd.net','okx.com','github.com','cloudflare.com','imasdk.googleapis.com','twitter.com','x.com'}
doms = set()
for r in json.load(open(old)):
    f = r['condition'].get('urlFilter', '')
    m = re.fullmatch(r'\|\|([a-z0-9.-]+\.[a-z]{2,})\^?', f) or re.fullmatch(r'\*([a-z0-9.-]+\.[a-z]{2,})\*', f)
    if m: doms.add(m.group(1))
doms -= NEVER
doms = sorted(doms)
ALL = ["main_frame","sub_frame","script","image","stylesheet","object","xmlhttprequest","font","media","websocket","ping","other"]
rules, rid = [], 1
for i in range(0, len(doms), 2500):
    rules.append({"id": rid, "priority": 1, "action": {"type": "block"},
                  "condition": {"requestDomains": doms[i:i+2500], "resourceTypes": ALL}})
    rid += 1
for f in ["||youtube.com/pagead/", "||youtube.com/api/stats/ads", "||youtube.com/get_midroll_"]:
    rules.append({"id": rid, "priority": 1, "action": {"type": "block"},
                  "condition": {"urlFilter": f, "resourceTypes": ["xmlhttprequest","image","script","ping","other","media"]}})
    rid += 1
(root/'rules'/'ads.json').write_text(json.dumps(rules, separators=(',', ':')))
print(len(doms), 'domains ->', len(rules), 'rules')
