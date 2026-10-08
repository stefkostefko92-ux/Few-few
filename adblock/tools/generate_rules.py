# Generates rules/ad_rules.json and rules/youtube_rules.json — the hand-curated
# static rulesets (the public lists are built by tools/build_filters.mjs).
#
#   python3 tools/generate_rules.py [--out DIR]     # default: <adblock>/rules
#
# The output must be byte-identical to the committed files: rule ids are fixed
# here (never renumbered — a retired id stays retired), and each file keeps the
# format it is committed in. tests/generate_rules.test.mjs regenerates into a
# temp dir and compares.
import json
import os
import sys

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "rules")
if "--out" in sys.argv:
    OUT = sys.argv[sys.argv.index("--out") + 1]

def write(name, data, indent, newline):
    with open(os.path.join(OUT, name), "w") as f:
        f.write(json.dumps(data, indent=indent) + ("\n" if newline else ""))

# ---- Comprehensive ad / tracker domain blocklist ----
AD_DOMAINS = [
    # Google ad/tracking
    "doubleclick.net","googlesyndication.com","googleadservices.com","google-analytics.com",
    "googletagmanager.com","googletagservices.com","adservice.google.com","2mdn.net",
    "app-measurement.com","analytics.google.com","pagead2.googlesyndication.com",
    # Big SSP/DSP/exchanges
    "adnxs.com","adnxs-simple.com","amazon-adsystem.com","adsystem.com","adsrvr.org",
    "advertising.com","criteo.com","criteo.net","pubmatic.com","rubiconproject.com",
    "openx.net","openx.com","casalemedia.com","adform.net","smartadserver.com",
    "moatads.com","yieldmo.com","3lift.com","sharethrough.com","quantserve.com",
    "quantcount.com","zedo.com","contextweb.com","gumgud.com","gumgum.com",
    "indexww.com","districtm.io","sonobi.com","spotxchange.com","spotx.tv",
    "teads.tv","yieldlab.net","improvedigital.com","adroll.com","adition.com",
    "stickyadstv.com","bidswitch.net","mathtag.com","bluekai.com","krxd.net",
    "agkn.com","exelator.com","rlcdn.com","tapad.com","crwdcntrl.net",
    "demdex.net","everesttech.net","adsafeprotected.com","scorecardresearch.com",
    "247realmedia.com","adtech.de","atdmt.com","serving-sys.com","flashtalking.com",
    "mediavine.com","ezoic.net","ezojs.com","adskeeper.com","mgid.com",
    "revcontent.com","taboola.com","taboola.net","outbrain.com","zergnet.com",
    "nativo.com","plista.com","ligatus.com","dianomi.com","content.ad",
    # Pop/aggressive ad networks
    "popads.net","popcash.net","propellerads.com","propeller-tracking.com","exoclick.com",
    "exosrv.com","juicyads.com","trafficjunky.net","trafficjunky.com","adsterra.com",
    "admaven.com","ad-maven.com","bidvertiser.com","clickadu.com","hilltopads.net",
    "adcash.com","mobfox.com","mobsmith.com","onclickads.net","onclasrv.com",
    "popunder.net","clksite.com","clickaine.com","adnium.com","ad-delivery.net",
    # Video / pre-roll
    "adcolony.com","applovin.com","unityads.unity3d.com","vungle.com","inmobi.com",
    "smaato.net","fyber.com","chartboost.com","tapjoy.com","ironsrc.com",
    "freewheel.tv","fwmrm.net","innovid.com","springserve.com","brightcove.com.ads",
    # Analytics / tracking
    "hotjar.com","hotjar.io","mixpanel.com","segment.io","segment.com","heap.io",
    "heapanalytics.com","fullstory.com","mouseflow.com","clicktale.net","clarity.ms",
    "newrelic.com","nr-data.net","amplitude.com","kissmetrics.com","chartbeat.com",
    "chartbeat.net","parsely.com","keywee.co","branch.io","appsflyer.com",
    "adjust.com","kochava.com","singular.net","tune.com","mparticle.com",
    "optimizely.com","crazyegg.com","luckyorange.com","yandex.ru/clck","mc.yandex.ru",
    "matomo.cloud","statcounter.com","quantcast.com","comscore.com","cxense.com",
    "permutive.com","lytics.io","tealiumiq.com","ensighten.com","bizible.com",
    "marketo.net","pardot.com","hubspot.com","hs-analytics.net","6sc.co",
    # Social trackers (tracking endpoints)
    "connect.facebook.net","facebook.com/tr","pixel.facebook.com","analytics.tiktok.com",
    "ads.tiktok.com","business-api.tiktok.com","ads.pinterest.com","ct.pinterest.com",
    "ads.linkedin.com","px.ads.linkedin.com","ads-twitter.com","analytics.twitter.com",
    "static.ads-twitter.com","ads.yahoo.com","analytics.yahoo.com","sb.scorecardresearch.com",
    # Misc / CMP / consent spam (tracking)
    "onesignal.com","pushcrew.com","pushengage.com","sendpulse.com","getsitecontrol.com",
    "intentiq.com","id5-sync.com","liadm.com","liveramp.com","pippio.com",
    "cdn.adsafeprotected.com","static.criteo.net","sslwidget.criteo.com",
    "yieldoptimizer.com","sascdn.com","adgrx.com","admixer.net","adkernel.com",
    "loopme.com","pubnative.net","smartyads.com","epom.com","adtelligent.com",
    "go.sonobi.com","aax.amazon-adsystem.com","fls-na.amazon-adsystem.com",
]

# URL path patterns to block (substring/anchored)
PATH_PATTERNS = [
    "/pagead/","/adservice","/ad-banner","/banner_ad","/advertisement","/advert/",
    "/ads/ads","/adframe","/adserver","/adsystem","/adtech/","/popunder",
    "/sponsorads","/sponsored-","/track/ad","/adcontent","/getad?","/showad",
    "/displayad","/video-ads","/preroll","/midroll","/vast?","/vmap?",
    "/openrtb","/prebid","/header-bidding","/gpt/pubads","/dfp/",
]

rules = []
rid = 1
RES_FULL = ["script","image","sub_frame","xmlhttprequest","media","ping","font","stylesheet","object"]
RES_TRACK = ["script","image","xmlhttprequest","ping"]

for d in AD_DOMAINS:
    if "/" in d:
        # domain with path -> use as urlFilter with ||
        uf = "||" + d
        res = RES_TRACK
    else:
        uf = "||" + d + "^"
        res = RES_FULL
    rules.append({
        "id": rid, "priority": 1,
        "action": {"type": "block"},
        "condition": {"urlFilter": uf, "resourceTypes": res}
    })
    rid += 1

for p in PATH_PATTERNS:
    rules.append({
        "id": rid, "priority": 1,
        "action": {"type": "block"},
        "condition": {"urlFilter": p, "resourceTypes": ["script","image","sub_frame","xmlhttprequest","media"]}
    })
    rid += 1

# #238 (5.1.2): ad/analytics hosts of big first parties — blocked only as a THIRD
# party, so youtube.com, yahoo.com, yandex.ru, x.com… keep working on their own
# sites. main_frame excluded like every block rule (never block a navigation).
THIRD_PARTY_ONLY = [
    "adfstat.yandex.ru", "ads-api.tiktok.com", "ads-api.twitter.com", "ads-sg.tiktok.com",
    "ads.youtube.com", "adsfs.oppomobile.com", "adtech.yahooinc.com", "adx.ads.oppomobile.com",
    "an.facebook.com", "analytics.query.yahoo.com", "analytics.s3.amazonaws.com",
    "analyticsengine.s3.amazonaws.com", "api-adservices.apple.com", "appmetrica.yandex.ru",
    "bdapi-ads.realmemobile.com", "bdapi-in-ads.realmemobile.com", "books-analytics-events.apple.com",
    "ck.ads.oppomobile.com", "data.ads.oppomobile.com", "data.mistat.india.xiaomi.com",
    "data.mistat.rus.xiaomi.com", "data.mistat.xiaomi.com", "gemini.yahoo.com", "grs.hicloud.com",
    "iadsdk.apple.com", "iot-eu-logser.realme.com", "iot-logser.realme.com", "log.byteoversea.com",
    "log.fc.yahoo.com", "metrika.yandex.ru", "notes-analytics-events.apple.com", "offerwall.yandex.net",
    "tracking.rus.miui.com", "udcm.yahoo.com", "weather-analytics-events.apple.com",
]
assert rid == 238, "ids 1..237 are the domain + path rules above"
rules.append({
    "id": 238, "priority": 1,
    "action": {"type": "block"},
    "condition": {"domainType": "thirdParty", "requestDomains": THIRD_PARTY_ONLY, "excludedResourceTypes": ["main_frame"]}
})
rid = 239

# ---- Breakage fixes (allow, priority 10 — above every block rule) ----
# EasyPrivacy blocks the Facebook Page Plugin's own logging call. For a visitor
# logged into Facebook the plugin then throws ("ExceptionDialog", error 1357032)
# and its posts never load, on every site that embeds it. Allowed only from
# inside Facebook's own frame, so the call stays blocked everywhere else.
UNBREAK_ALLOW = [
    ("||facebook.com/platform/plugin/page/logging/", ["facebook.com"]),
]
for p, initiators in UNBREAK_ALLOW:
    rules.append({
        "id": rid, "priority": 10,
        "action": {"type": "allow"},
        "condition": {"urlFilter": p, "initiatorDomains": initiators, "resourceTypes": ["xmlhttprequest", "ping", "other"]}
    })
    rid += 1

write("ad_rules.json", rules, indent=1, newline=True)
print("ad_rules.json: %d rules (ids 1..%d)" % (len(rules), rid-1))

# ---- YouTube-specific rules ----
# We block the actual ad endpoints, but NOT /player and NOT the ad-status
# pipeline the player initialises against. The modern YouTube player waits for
# doubleclick's ad_status.js / pagead id ping before it will start playback; if
# those are blocked it produces a broken video URL and the video never loads.
# So we let them load (harmless — youtube_main.js already strips the ads from
# the player response) via high-priority allow rules that override the generic
# ||doubleclick.net^ block.
#
# We also do NOT block /youtubei/v1/log_event or /csi_204 (logging/timing, not
# ads) — that only spammed the console.
#
# Nor /ptracking or /api/stats/atr (5.1.3): ptracking is the CONTENT playback ping
# and most ATR pings are ordinary — a player that never reports playing anything
# is one of the signals behind YouTube's "three strikes". The single ATR ping that
# carries the ad state is answered locally by youtube_main.js (uBO's pattern).
# Ids are fixed: 1001 (youtube.com/ptracking) and 1003 (youtube.com/api/stats/atr)
# were retired in 5.1.3 and are never reused.
YT_BLOCK = [
    (1000, "youtube.com/pagead/"),
    (1002, "youtube.com/api/stats/ads"),
    (1004, "youtube.com/get_midroll_"),
    (1005, "youtube.com/get_video_info?*adformat"),
    (1006, "youtube.com/youtubei/v1/player/ad_break"),
    (1007, "s.youtube.com/api/stats/ads"),
]

# Player-init resources that must be allowed to load on YouTube.
YT_ALLOW = [
    (1008, "||doubleclick.net/instream/ad_status"),
    (1009, "||doubleclick.net/pagead/id"),
    (1010, "||googleads.g.doubleclick.net/pagead/id"),
]

yt = []
for yid, p in YT_BLOCK:
    yt.append({
        "id": yid, "priority": 2,
        "action": {"type": "block"},
        "condition": {"urlFilter": p, "resourceTypes": ["xmlhttprequest","image","sub_frame","script","ping","media"]}
    })

for yid, p in YT_ALLOW:
    yt.append({
        "id": yid, "priority": 10,
        "action": {"type": "allow"},
        "condition": {
            "urlFilter": p,
            "initiatorDomains": ["youtube.com", "youtube-nocookie.com"],
            "resourceTypes": ["script", "image", "xmlhttprequest"],
        },
    })

write("youtube_rules.json", yt, indent=2, newline=False)
print("youtube_rules.json: %d rules" % len(yt))
