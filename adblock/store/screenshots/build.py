#!/usr/bin/env python3
"""Generate 1280x800 Chrome Web Store screenshot slides (self-contained HTML)."""
import os

HERE = os.path.dirname(os.path.abspath(__file__))

CSS = """
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1280px;height:800px;overflow:hidden}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
  color:#f5f5f0;background:#060608;
  background-image:repeating-linear-gradient(45deg,rgba(245,245,240,.02) 0 1px,transparent 1px 3px),
    radial-gradient(1200px 700px at 78% 30%,rgba(0,229,255,.10),transparent 60%);
  background-size:7px 7px,100% 100%;
  display:grid;grid-template-columns:1fr 460px;align-items:center;gap:40px;padding:0 72px}
.left{max-width:560px}
.kicker{display:inline-flex;align-items:center;gap:9px;color:#00e5ff;font-size:14px;
  letter-spacing:2px;text-transform:uppercase;font-weight:700;margin-bottom:22px}
.kicker::before{content:"";width:26px;height:26px;border-radius:7px;
  background:linear-gradient(135deg,#00e5ff,#0096b4);box-shadow:0 0 22px rgba(0,229,255,.5)}
h1{font-size:52px;line-height:1.08;letter-spacing:-.5px;font-weight:800}
h1 .c{color:#00e5ff}
p.sub{margin-top:20px;font-size:20px;line-height:1.5;color:#b9b9b2}
ul.feat{margin-top:26px;list-style:none}
ul.feat li{font-size:17px;color:#d4d4cd;padding:7px 0 7px 30px;position:relative}
ul.feat li::before{content:"";position:absolute;left:0;top:13px;width:14px;height:14px;border-radius:4px;
  background:linear-gradient(135deg,#00e5ff,#00b8d4)}
.right{display:flex;align-items:center;justify-content:center}

/* popup card (faithful to the real UI) */
.pop{width:340px;border-radius:16px;overflow:hidden;border:1px solid #262a31;
  background:#0a0b0d;box-shadow:0 40px 90px rgba(0,0,0,.6),0 0 0 1px rgba(0,229,255,.06)}
.bar{display:flex;align-items:center;gap:11px;padding:15px 16px;background:#0e0f12;border-bottom:1px solid #262a31}
.logo{width:28px;height:28px;border-radius:7px;background:linear-gradient(135deg,#00e5ff,#0096b4);
  display:grid;place-items:center;font-size:16px}
.brand h2{font-size:15px;font-weight:800}
.brand span{font-size:10px;letter-spacing:1.6px;text-transform:uppercase;color:#00e5ff}
.sw{margin-left:auto;width:46px;height:26px;border-radius:26px;position:relative;
  background:linear-gradient(#00b8d4,#00e5ff);border:1px solid #00b8d4}
.sw::after{content:"";position:absolute;top:2px;left:22px;width:20px;height:20px;border-radius:50%;background:#fff}
.pad{padding:14px;display:flex;flex-direction:column;gap:12px}
.hero{display:flex;align-items:center;gap:12px;padding:14px 15px;border-radius:12px;border:1px solid #262a31;
  background:linear-gradient(180deg,#131418,#0e0f12);position:relative;overflow:hidden}
.hero::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:#00ff88}
.pulse{width:11px;height:11px;border-radius:50%;background:#00ff88;box-shadow:0 0 0 4px rgba(0,255,136,.16)}
.hero b{display:block;font-size:14px}
.hero small{font-size:11.5px;color:#8c8c84}
.metrics{display:flex;gap:8px}
.metric{flex:1;text-align:center;padding:12px 4px;border-radius:12px;background:#0e0f12;border:1px solid #262a31}
.metric b{display:block;font-size:17px;font-weight:800;color:#00e5ff;text-shadow:0 0 14px rgba(0,229,255,.3)}
.metric small{font-size:9px;letter-spacing:.4px;text-transform:uppercase;color:#8c8c84;margin-top:4px;display:block}
.site{display:flex;align-items:center;justify-content:space-between;padding:11px 13px;border-radius:12px;
  background:#0e0f12;border:1px solid #262a31;font-size:12.5px}
.site .h{font-weight:600}.site .a{color:#8c8c84;font-size:11px}
.acts{display:flex;gap:8px}
.act{flex:1;text-align:center;padding:10px;border-radius:10px;border:1px solid #262a31;background:#1a1c20;
  font-size:12px;font-weight:600;color:#f5f5f0}
.foot{display:flex;align-items:center;justify-content:space-between;padding:10px 15px;border-top:1px solid #262a31;
  font-size:10.5px;color:#8c8c84}
.dot{display:inline-flex;align-items:center;gap:5px}
.dot::before{content:"";width:7px;height:7px;border-radius:50%;background:#00ff88;box-shadow:0 0 6px #00ff88}

/* settings panel mock */
.panel{width:390px;border-radius:16px;border:1px solid #262a31;background:#0e0f12;overflow:hidden;
  box-shadow:0 40px 90px rgba(0,0,0,.6)}
.panel .ph{padding:16px 18px;background:linear-gradient(135deg,#15171b,#0a0b0e);border-bottom:1px solid #262a31;
  display:flex;align-items:center;gap:12px}
.panel .ph .logo{width:26px;height:26px}
.panel .ph b{font-size:15px}.panel .ph span{font-size:10px;color:#00e5ff;letter-spacing:1.5px;text-transform:uppercase}
.card{margin:14px;padding:16px;border-radius:12px;background:#0a0b0d;border:1px solid #262a31}
.card h3{font-size:12px;text-transform:uppercase;letter-spacing:1.1px;color:#00e5ff;margin-bottom:12px}
.row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0;border-top:1px solid #20242b}
.row:first-of-type{border-top:none}
.row .t{font-size:13.5px;font-weight:600}.row .d{font-size:11px;color:#8c8c84;margin-top:2px}
.badge{font-size:9px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:#04232a;
  background:linear-gradient(135deg,#00e5ff,#00b8d4);border-radius:4px;padding:1px 6px;margin-left:6px}
.mini{width:40px;height:22px;border-radius:22px;position:relative;flex:none;
  background:linear-gradient(#00b8d4,#00e5ff);border:1px solid #00b8d4}
.mini.off{background:#3a3f47;border-color:#262a31}
.mini::after{content:"";position:absolute;top:2px;left:20px;width:16px;height:16px;border-radius:50%;background:#fff}
.mini.off::after{left:2px;background:#cfd2d6}
.logline{display:flex;justify-content:space-between;padding:9px 11px;background:#0e0f12;border:1px solid #262a31;
  border-radius:8px;margin-top:8px;font-size:12px}
.logline .m{color:#8c8c84;font-family:monospace;font-size:11px}
"""

SHIELD = '<div class="logo">🛡️</div>'

def popup(blocked="1,204", data="68 MB", time="14 min", host="nytimes.com"):
    return f"""
<div class="pop">
  <div class="bar">{SHIELD}<div class="brand"><h2>The Best Ads Block</h2><span>Carbon Stealth</span></div><div class="sw"></div></div>
  <div class="pad">
    <div class="hero"><span class="pulse"></span><div><b>Protected</b><small>Blocking ads on this page</small></div></div>
    <div class="metrics">
      <div class="metric"><b>{blocked}</b><small>Blocked</small></div>
      <div class="metric"><b>{data}</b><small>Data saved</small></div>
      <div class="metric"><b>{time}</b><small>Time saved</small></div>
    </div>
    <div class="site"><span class="h">{host}</span><span class="a">Blocking</span></div>
    <div class="acts"><div class="act">🎯 Hide element</div><div class="act">⚙️ Settings</div></div>
  </div>
  <div class="foot"><span>v3.8.2</span><span class="dot">248+ filters</span></div>
</div>"""

def slide(kicker, h1_html, sub, feats, visual):
    li = "".join(f"<li>{f}</li>" for f in feats)
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>{CSS}</style></head>
<body>
  <div class="left">
    <div class="kicker">{kicker}</div>
    <h1>{h1_html}</h1>
    <p class="sub">{sub}</p>
    <ul class="feat">{li}</ul>
  </div>
  <div class="right">{visual}</div>
</body></html>"""

# ---- panels for specific slides ----
def features_panel():
    return f"""
<div class="panel">
  <div class="ph">{SHIELD}<div><b>Settings</b><br><span>Carbon Stealth</span></div></div>
  <div class="card"><h3>Extra protection</h3>
    <div class="row"><div><div class="t">Smart Detection <span class="badge">unique</span></div><div class="d">Catches ads no filter list knows yet</div></div><div class="mini"></div></div>
    <div class="row"><div><div class="t">YouTube ad blocking</div><div class="d">Remove pre-roll & mid-roll video ads</div></div><div class="mini"></div></div>
    <div class="row"><div><div class="t">Cookie / consent banners</div><div class="d">Dismissed automatically</div></div><div class="mini"></div></div>
    <div class="row"><div><div class="t">Meta sponsored posts</div><div class="d">Hidden on Facebook & Instagram</div></div><div class="mini"></div></div>
    <div class="row"><div><div class="t">Anti-adblock bypass</div><div class="d">Removes "disable your adblocker" walls</div></div><div class="mini"></div></div>
  </div>
</div>"""

def smartlog_panel():
    return f"""
<div class="panel">
  <div class="ph">{SHIELD}<div><b>Smart Detection log</b><br><span>why blocked</span></div></div>
  <div class="card"><h3>Caught heuristically · no filter list</h3>
    <div class="logline"><div><div class="t">nytimes.com</div><div class="m">Ad-sized cross-origin frame · 300×250</div></div><div class="m">2m ago</div></div>
    <div class="logline"><div><div class="t">forbes.com</div><div class="m">Sticky banner ad · 970×90</div></div><div class="m">5m ago</div></div>
    <div class="logline"><div><div class="t">bbc.com</div><div class="m">Ad-sized cross-origin frame · 728×90</div></div><div class="m">11m ago</div></div>
    <div class="logline"><div><div class="t">reddit.com</div><div class="m">Sticky banner ad · 320×50</div></div><div class="m">18m ago</div></div>
  </div>
</div>"""

SLIDES = [
    ("Free · Private · Fast",
     'Block ads <span class="c">everywhere</span>',
     "One click and the web is clean. Banners, pop-ups, trackers and YouTube video ads — gone.",
     ["YouTube pre-roll & mid-roll ads", "Banners, pop-ups & pop-unders", "Trackers and analytics", "Lighter, faster pages"],
     popup()),
    ("YouTube",
     'YouTube video ads, <span class="c">gone</span>',
     "Pre-roll and mid-roll ads are removed at the source, so videos just play.",
     ["Removes ads before they start", "Auto-skips anything that slips through", "Plays the video even on flagged accounts"],
     popup(blocked="3,782", data="1.4 GB", time="52 min", host="youtube.com")),
    ("Unique",
     'Blocks ads <span class="c">no list knows</span>',
     "Smart Detection spots ads by their shape — catching brand-new placements that rule-based blockers miss.",
     ["List-free heuristic detection", "Catches zero-day ad slots", "See exactly why each was blocked"],
     smartlog_panel()),
    ("Your controls",
     'Powerful, <span class="c">in your hands</span>',
     "Per-site allowlist, custom filters, element picker, themes and cross-device sync.",
     ["Allow ads on sites you support", "Write your own filters", "Right-click to hide anything"],
     features_panel()),
    ("Private by design",
     '100% free. <span class="c">Zero tracking.</span>',
     "No account, no telemetry, no data collection. Everything runs on your device.",
     ["No analytics, ever", "Nothing about you is sent", "Open source · MIT licensed"],
     popup(blocked="9,140", data="4.6 GB", time="2.3 h", host="facebook.com")),
]

for i, s in enumerate(SLIDES, 1):
    open(os.path.join(HERE, f"slide{i}.html"), "w").write(slide(*s))
    print("wrote slide", i)
