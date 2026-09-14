(function () {
  "use strict";
  var noopfn = function () {};
  var ga = function () {
    var a = arguments;
    if (a.length && typeof a[a.length - 1] === "function") { try { a[a.length - 1](); } catch (e) {} }
  };
  ga.create = function () { return { get: noopfn, set: noopfn, send: noopfn }; };
  ga.getByName = function () { return null; };
  ga.getAll = function () { return []; };
  ga.remove = noopfn; ga.loaded = true; ga.q = [];
  window.ga = window.ga || ga;
  window.gtag = window.gtag || function () {};
  var dl = window.dataLayer;
  if (dl && typeof dl.push === "function") {
    dl.push = function (o) {
      if (o && typeof o.eventCallback === "function") { try { o.eventCallback(); } catch (e) {} }
      return 1;
    };
  } else {
    window.dataLayer = { push: function () { return 1; } };
  }
  window.google_tag_manager = window.google_tag_manager || {};
})();
