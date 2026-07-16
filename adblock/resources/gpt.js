(function () {
  "use strict";
  if (window.googletag && window.googletag.apiReady) return;
  var noopfn = function () {};
  var slot = {};
  var slotApi = ["addService","clearCategoryExclusions","clearTargeting","defineSizeMapping",
    "get","getAdUnitPath","getAttributeKeys","getCategoryExclusions","getDomId","getResponseInformation",
    "getSlotElementId","getTargeting","getTargetingKeys","set","setCategoryExclusion","setClickUrl",
    "setCollapseEmptyDiv","setForceSafeFrame","setSafeFrameConfig","setTargeting","toString","updateTargetingFromMap"];
  slotApi.forEach(function (m) { slot[m] = function () { return slot; }; });
  slot.getSlotElementId = function () { return ""; };
  slot.get = function () { return null; };

  var pubads = {};
  var pubadsApi = ["addEventListener","clear","clearCategoryExclusions","clearTagForChildDirectedTreatment",
    "clearTargeting","collapseEmptyDivs","defineOutOfPagePassback","definePassback","disableInitialLoad",
    "display","enableAsyncRendering","enableLazyLoad","enableSingleRequest","enableSyncRendering",
    "enableVideoAds","get","getAttributeKeys","getTargeting","getTargetingKeys","getSlots","isInitialLoadDisabled",
    "refresh","removeEventListener","set","setCategoryExclusion","setCentering","setCookieOptions",
    "setForceSafeFrame","setLocation","setPublisherProvidedId","setPrivacySettings","setRequestNonPersonalizedAds",
    "setSafeFrameConfig","setTagForChildDirectedTreatment","setTargeting","setVideoContent","updateCorrelator"];
  pubadsApi.forEach(function (m) { pubads[m] = function () { return pubads; }; });
  pubads.getSlots = function () { return []; };
  pubads.addEventListener = function () { return pubads; };

  var gt = {
    apiReady: true,
    cmd: [],
    pubads: function () { return pubads; },
    defineSlot: function () { return slot; },
    defineOutOfPageSlot: function () { return slot; },
    destroySlots: noopfn,
    display: noopfn,
    enableServices: noopfn,
    getVersion: function () { return "0"; },
    sizeMapping: function () {
      var b = { addSize: function () { return b; }, build: function () { return []; } };
      return b;
    },
    setAdIframeTitle: noopfn,
    companionAds: function () { return { addEventListener: noopfn, setRefreshUnfilledSlots: noopfn }; },
    content: function () { return { addContent: noopfn, setContent: noopfn }; }
  };
  var push = function (fn) { if (typeof fn === "function") { try { fn(); } catch (e) {} } return 1; };
  gt.cmd.push = push;
  window.googletag = gt;
})();
