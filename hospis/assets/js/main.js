/* Мобилно меню + текуща година. Без зависимости, без бисквитки, без localStorage. */
(function () {
  "use strict";

  var toggle = document.querySelector(".nav-toggle");
  var panel = document.getElementById("nav-panel");

  if (toggle && panel) {
    var mq = window.matchMedia("(max-width: 980px)");

    var setOpen = function (open, returnFocus) {
      panel.setAttribute("data-open", String(open));
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Затвори менюто" : "Отвори менюто");
      document.documentElement.style.overflow = open && mq.matches ? "hidden" : "";
      if (!open && returnFocus) toggle.focus();
    };

    toggle.addEventListener("click", function () {
      setOpen(panel.getAttribute("data-open") !== "true");
    });

    // Затваряне: Escape, клик извън панела, избор на връзка, преминаване към десктоп.
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && panel.getAttribute("data-open") === "true") setOpen(false, true);
    });
    document.addEventListener("click", function (e) {
      if (panel.getAttribute("data-open") === "true" && !panel.contains(e.target) && !toggle.contains(e.target)) setOpen(false);
    });
    panel.addEventListener("click", function (e) {
      if (e.target.closest("a")) setOpen(false);
    });
    var onChange = function () { if (!mq.matches) setOpen(false); };
    if (mq.addEventListener) mq.addEventListener("change", onChange); else mq.addListener(onChange);

    // Менюто е скрито за помощните технологии, докато е затворено (само на малки екрани).
    var syncInert = function () {
      var closed = mq.matches && panel.getAttribute("data-open") !== "true";
      if (closed) panel.setAttribute("inert", ""); else panel.removeAttribute("inert");
    };
    new MutationObserver(syncInert).observe(panel, { attributes: true, attributeFilter: ["data-open"] });
    if (mq.addEventListener) mq.addEventListener("change", syncInert);
    syncInert();
  }

  var year = document.querySelector("[data-year]");
  if (year) year.textContent = String(new Date().getFullYear());
})();
