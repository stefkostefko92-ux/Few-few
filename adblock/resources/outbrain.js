// Supreme AdBlock surrogate for the Outbrain widget loader — clean-room, MIT.
// Pages reference OBR.extern.* after load; a missing OBR throws in their code.
(function () {
  "use strict";
  var noop = function () {};
  window.OBR = window.OBR || {
    extern: {
      researchWidget: noop, reloadWidget: noop, refreshWidget: noop, refreshHrefs: noop,
      callClick: noop, callWidget: noop, callLoad: noop, callHTMLWidgetLoad: noop,
      callRecWidget: noop, videoClickThru: noop, callBypassClick: noop,
      callGetVersion: function () { return "1"; },
    },
  };
})();
