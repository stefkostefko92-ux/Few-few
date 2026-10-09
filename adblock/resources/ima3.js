// Supreme AdBlock surrogate for the Google IMA SDK (ima3.js) — clean-room, MIT.
// Video players that load the IMA SDK wait for an AdsLoader → adsManagerLoaded →
// AdsManager → LOADED / CONTENT_RESUME_REQUESTED / ALL_ADS_COMPLETED sequence.
// This stub plays that sequence with zero ads so the content simply starts,
// instead of the player hanging on a blocked SDK request.
(function () {
  "use strict";
  var g = (window.google = window.google || {});
  if (g.ima && g.ima.__saSurrogate) return;

  function emitter() {
    var m = {};
    return {
      add: function (t, f) { (m[t] = m[t] || []).push(f); },
      remove: function (t, f) { if (m[t]) m[t] = m[t].filter(function (x) { return x !== f; }); },
      fire: function (t, ev) { (m[t] || []).slice().forEach(function (f) { try { f(ev); } catch (e) {} }); },
    };
  }
  var noop = function () {};
  var later = function (fn) { try { setTimeout(fn, 0); } catch (e) { fn(); } };

  var AdEventType = {
    AD_BREAK_READY: "adBreakReady", AD_BUFFERING: "adBuffering", AD_CAN_PLAY: "adCanPlay",
    AD_METADATA: "adMetadata", AD_PROGRESS: "adProgress", ALL_ADS_COMPLETED: "allAdsCompleted",
    CLICK: "click", COMPLETE: "complete", CONTENT_PAUSE_REQUESTED: "contentPauseRequested",
    CONTENT_RESUME_REQUESTED: "contentResumeRequested", DURATION_CHANGE: "durationChange",
    EXPANDED_CHANGED: "expandedChanged", FIRST_QUARTILE: "firstQuartile", IMPRESSION: "impression",
    INTERACTION: "interaction", LINEAR_CHANGED: "linearChanged", LOADED: "loaded", LOG: "log",
    MIDPOINT: "midpoint", PAUSED: "pause", RESUMED: "resume", SKIPPABLE_STATE_CHANGED: "skippableStateChanged",
    SKIPPED: "skip", STARTED: "started", THIRD_QUARTILE: "thirdQuartile", USER_CLOSE: "userClose",
    VIEWABLE_IMPRESSION: "viewable_impression", VOLUME_CHANGED: "volumeChange", VOLUME_MUTED: "mute",
  };

  function AdError() {}
  AdError.prototype.getErrorCode = function () { return 1009; };
  AdError.prototype.getMessage = function () { return "No ads"; };
  AdError.prototype.getType = function () { return "adLoadError"; };
  AdError.prototype.getInnerError = function () { return null; };
  AdError.prototype.getVastErrorCode = function () { return 1009; };
  AdError.prototype.toString = function () { return "AdError 1009: No ads"; };

  function AdsManager() {
    var L = emitter();
    this.addEventListener = L.add;
    this.removeEventListener = L.remove;
    this.init = noop;
    this.start = function () {
      later(function () {
        L.fire(AdEventType.LOADED, { type: AdEventType.LOADED, getAd: function () { return null; }, getAdData: function () { return {}; } });
        L.fire(AdEventType.CONTENT_RESUME_REQUESTED, { type: AdEventType.CONTENT_RESUME_REQUESTED });
        L.fire(AdEventType.ALL_ADS_COMPLETED, { type: AdEventType.ALL_ADS_COMPLETED });
      });
    };
    this.stop = this.pause = this.resume = this.skip = this.destroy = this.discardAdBreak = noop;
    this.resize = this.setVolume = this.updateAdsRenderingSettings = this.focus = this.collapse = this.expand = noop;
    this.configureAdsManager = noop;
    this.getRemainingTime = function () { return 0; };
    this.getVolume = function () { return 1; };
    this.getCuePoints = function () { return []; };
    this.getCurrentAd = function () { return null; };
    this.getAdSkippableState = function () { return false; };
    this.isCustomClickTrackingUsed = function () { return false; };
    this.isCustomPlaybackUsed = function () { return false; };
  }

  function ManagerLoadedEvent(manager) {
    this.type = "adsManagerLoaded";
    this.getAdsManager = function () { return manager; };
    this.getUserRequestContext = function () { return null; };
  }

  function AdsLoader() {
    var L = emitter();
    this.addEventListener = L.add;
    this.removeEventListener = L.remove;
    this.contentComplete = noop;
    this.destroy = noop;
    this.getSettings = function () { return g.ima.settings; };
    this.getVersion = function () { return "3.0"; };
    this.requestAds = function () {
      later(function () { L.fire("adsManagerLoaded", new ManagerLoadedEvent(new AdsManager())); });
    };
  }

  function AdDisplayContainer() { this.initialize = noop; this.destroy = noop; }
  function AdsRequest() {
    this.setAdWillAutoPlay = this.setAdWillPlayMuted = this.setContinuousPlayback = noop;
    this.adTagUrl = ""; this.adsResponse = null;
  }
  function AdsRenderingSettings() {}
  function ImaSdkSettings() {}
  ["setAutoPlayAdBreaks", "setCookiesEnabled", "setDisableCustomPlaybackForIOS10Plus", "setLocale",
    "setNumRedirects", "setPlayerType", "setPlayerVersion", "setPpid", "setVpaidMode", "setSessionId",
    "setIsBrowserCookiesEnabled", "setFeatureFlags", "setDisableFlashAds", "setVpaidAllowed"]
    .forEach(function (k) { ImaSdkSettings.prototype[k] = noop; });
  ImaSdkSettings.prototype.getAutoPlayAdBreaks = function () { return true; };
  ImaSdkSettings.prototype.isCookiesEnabled = function () { return false; };
  ImaSdkSettings.prototype.getLocale = function () { return "en"; };
  ImaSdkSettings.prototype.getNumRedirects = function () { return 4; };
  ImaSdkSettings.prototype.getPlayerType = function () { return ""; };
  ImaSdkSettings.prototype.getPlayerVersion = function () { return ""; };
  ImaSdkSettings.prototype.getPpid = function () { return ""; };
  ImaSdkSettings.prototype.getFeatureFlags = function () { return {}; };
  ImaSdkSettings.prototype.getDisableFlashAds = function () { return true; };
  ImaSdkSettings.CompanionBackfillMode = { ALWAYS: "always", ON_MASTER_AD: "on_master_ad" };
  ImaSdkSettings.VpaidMode = { DISABLED: 0, ENABLED: 1, INSECURE: 2 };

  g.ima = {
    __saSurrogate: true,
    VERSION: "3.0",
    AdDisplayContainer: AdDisplayContainer,
    AdsLoader: AdsLoader,
    AdsRequest: AdsRequest,
    AdsRenderingSettings: AdsRenderingSettings,
    ImaSdkSettings: ImaSdkSettings,
    settings: new ImaSdkSettings(),
    AdError: AdError,
    AdEvent: { Type: AdEventType },
    AdErrorEvent: { Type: { AD_ERROR: "adError" } },
    AdsManagerLoadedEvent: { Type: { ADS_MANAGER_LOADED: "adsManagerLoaded" } },
    ViewMode: { NORMAL: "normal", FULLSCREEN: "fullscreen" },
    UiElements: { AD_ATTRIBUTION: "adAttribution", COUNTDOWN: "countdown" },
    OmidAccessMode: { DOMAIN: "domain", FULL: "full", LIMITED: "limited" },
    OmidVerificationVendor: { OTHER: 1 },
    CompanionAdSelectionSettings: function () {},
    UniversalAdIdInfo: function () {},
  };
})();
