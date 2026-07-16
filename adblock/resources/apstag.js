(function () {
  "use strict";
  var noopfn = function () {};
  window.apstag = {
    init: noopfn,
    fetchBids: function (cfg, cb) { if (typeof cb === "function") { try { cb([]); } catch (e) {} } },
    setDisplayBids: noopfn,
    targetingKeys: function () { return []; },
    bids: [],
    _getSlotIdToNameMapping: noopfn,
    rpa: noopfn, dpa: noopfn, debug: noopfn
  };
})();
