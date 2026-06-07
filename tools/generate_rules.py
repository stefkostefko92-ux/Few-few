import json

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

with open("rules/ad_rules.json","w") as f:
    json.dump(rules, f, indent=2)
print("ad_rules.json: %d rules (ids 1..%d)" % (len(rules), rid-1))

# ---- YouTube-specific rules (safe: ad endpoints only, NOT /player) ----
# Note: we intentionally do NOT block /youtubei/v1/log_event or /csi_204 —
# those are general logging/timing beacons, not ads, and blocking them only
# spams the console with no ad-blocking benefit.
YT_BLOCK = [
    "youtube.com/pagead/",
    "youtube.com/ptracking",
    "youtube.com/api/stats/ads",
    "youtube.com/api/stats/atr",
    "youtube.com/get_midroll_",
    "youtube.com/get_video_info?*adformat",
    "googleads.g.doubleclick.net/pagead",
    "static.doubleclick.net",
    "youtube.com/youtubei/v1/player/ad_break",
    "s.youtube.com/api/stats/ads",
]
yt = []
yrid = 1000
for p in YT_BLOCK:
    yt.append({
        "id": yrid, "priority": 2,
        "action": {"type": "block"},
        "condition": {"urlFilter": p, "resourceTypes": ["xmlhttprequest","image","sub_frame","script","ping","media"]}
    })
    yrid += 1

with open("rules/youtube_rules.json","w") as f:
    json.dump(yt, f, indent=2)
print("youtube_rules.json: %d rules" % len(yt))
