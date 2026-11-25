// Supreme AdBlock — Global Privacy Control in the page: navigator.globalPrivacyControl
// is true, as the Sec-GPC: 1 request header (rules/gpc.json) already tells the server.
// GPC is a standard signal ("do not sell or share my personal data") that several
// privacy laws make sites honour; it carries no identifier. Registered by the service
// worker (MAIN world, document_start) only while the GPC switch is on, never on an
// allowed site or while protection is off or paused.
(function () {
  try {
    var nav = window.navigator;
    if (!nav || nav.globalPrivacyControl === true) return;
    var proto = Object.getPrototypeOf(nav) || nav;
    Object.defineProperty(proto, "globalPrivacyControl", { get: function () { return true; }, configurable: true, enumerable: true });
  } catch (e) {}
})();
