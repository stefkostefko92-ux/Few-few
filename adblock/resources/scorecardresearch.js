// Supreme AdBlock surrogate for comScore beacon.js — clean-room, MIT.
// Sites call COMSCORE.beacon({...}) unconditionally; a missing global throws
// and can halt the page's own init script. This keeps the API, sends nothing.
(function () {
  "use strict";
  window.COMSCORE = window.COMSCORE || { beacon: function () {}, purge: function () {} };
  window._comscore = window._comscore || [];
})();
