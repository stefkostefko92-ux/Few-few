/* Галерия: лек lightbox върху нативния <dialog>.
   Без JS връзките отварят снимката директно. Снимките се показват най-много в собствения си
   размер (680 px) — не се увеличават, за да не омекват. */
(function () {
  "use strict";

  var links = Array.prototype.slice.call(document.querySelectorAll("a.shot[data-full]"));
  if (!links.length || typeof HTMLDialogElement === "undefined") return;

  var dlg, img, text, count;
  var index = 0, opener = null;

  function build() {
    dlg = document.createElement("dialog");
    dlg.className = "lightbox on-dark";
    dlg.setAttribute("aria-label", "Преглед на снимка");
    dlg.innerHTML =
      '<figure class="lightbox__fig">' +
        '<img class="lightbox__img" alt="">' +
        '<figcaption class="lightbox__cap"><span class="lightbox__text"></span><span class="lightbox__count"></span></figcaption>' +
      '</figure>' +
      '<button type="button" class="lightbox__btn lightbox__close" aria-label="Затвори"><span class="i i-close" aria-hidden="true"></span></button>' +
      '<button type="button" class="lightbox__btn lightbox__prev" aria-label="Предишна снимка"><span class="i i-chev-l" aria-hidden="true"></span></button>' +
      '<button type="button" class="lightbox__btn lightbox__next" aria-label="Следваща снимка"><span class="i i-chev-r" aria-hidden="true"></span></button>';
    document.body.appendChild(dlg);

    img = dlg.querySelector(".lightbox__img");
    text = dlg.querySelector(".lightbox__text");
    count = dlg.querySelector(".lightbox__count");

    dlg.querySelector(".lightbox__close").addEventListener("click", close);
    dlg.querySelector(".lightbox__prev").addEventListener("click", function () { show(index - 1); });
    dlg.querySelector(".lightbox__next").addEventListener("click", function () { show(index + 1); });
    // Клик върху тъмния фон затваря; клик върху самата снимка — не.
    dlg.addEventListener("click", function (e) { if (e.target === dlg || e.target.classList.contains("lightbox__fig")) close(); });
    dlg.addEventListener("close", function () {
      document.documentElement.style.overflow = "";
      if (opener) opener.focus();
    });
    dlg.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft") { e.preventDefault(); show(index - 1); }
      else if (e.key === "ArrowRight") { e.preventDefault(); show(index + 1); }
    });
    var x0 = null;
    dlg.addEventListener("touchstart", function (e) { x0 = e.changedTouches[0].clientX; }, { passive: true });
    dlg.addEventListener("touchend", function (e) {
      if (x0 === null) return;
      var dx = e.changedTouches[0].clientX - x0; x0 = null;
      if (Math.abs(dx) > 50) show(index + (dx < 0 ? 1 : -1));
    }, { passive: true });
  }

  function show(i) {
    index = (i + links.length) % links.length;
    var a = links[index];
    img.src = a.getAttribute("data-full");
    img.alt = a.getAttribute("data-alt") || "";
    text.textContent = a.getAttribute("data-caption") || "";
    count.textContent = (index + 1) + " / " + links.length;
  }
  function open(i, from) {
    if (!dlg) build();
    opener = from; show(i);
    if (!dlg.open) dlg.showModal();
    document.documentElement.style.overflow = "hidden";
  }
  function close() { if (dlg.open) dlg.close(); }

  links.forEach(function (a, i) {
    a.addEventListener("click", function (e) { e.preventDefault(); open(i, a); });
  });
})();
