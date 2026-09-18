// fx/shop.js — истинска кошница за демото „онлайн магазин": добавяне от каталога, количества, суми,
// количка-чекмедже, поръчка в <dialog> (име · имейл · адрес · доставка · плащане) и потвърждение с номер.
// Без backend — поръчката не се изпраща никъде (демо), кошницата живее в sessionStorage. Нула зависимости.
(function () {
  var root = document.querySelector("[data-shop]"); if (!root) return;
  var L = {}; try { L = JSON.parse(root.dataset.shop || "{}"); } catch (e) {}
  var cur = L.currency || "€", fmt = function (n) { return L.format === "pre" ? cur + n.toFixed(2) : n.toFixed(2).replace(".", ",") + " " + cur; };
  var items = {}; try { items = JSON.parse(sessionStorage.getItem("cs-cart") || "{}"); } catch (e) {}
  var drawer = document.getElementById("cart"), list = drawer.querySelector(".cart-list"), sub = drawer.querySelector("[data-sub]"), del = drawer.querySelector("[data-del]"), tot = drawer.querySelector("[data-tot]"), empty = drawer.querySelector(".cart-empty"), foot = drawer.querySelector(".cart-foot");
  var badge = document.querySelectorAll("[data-cart-count]"), openers = document.querySelectorAll("[data-cart-open]"), dlg = document.getElementById("checkout"), form = dlg.querySelector("form"), done = dlg.querySelector(".co-done");
  var FREE = +L.freeFrom || 0, SHIP = +L.shipping || 0;
  function save() { try { sessionStorage.setItem("cs-cart", JSON.stringify(items)); } catch (e) {} }
  function count() { var n = 0; for (var k in items) n += items[k].q; return n; }
  function render() {
    var n = count(), s = 0, html = "";
    for (var k in items) { var it = items[k]; s += it.p * it.q; html += '<li data-k="' + k + '"><img src="' + it.img + '" alt="" width="64" height="43" loading="lazy"><div><strong>' + it.n + '</strong><span>' + fmt(it.p) + '</span></div><div class="qty"><button type="button" data-dec aria-label="−">−</button><b>' + it.q + '</b><button type="button" data-inc aria-label="+">+</button></div><button type="button" class="rm" data-rm aria-label="' + L.remove + '">×</button></li>'; }
    list.innerHTML = html; empty.hidden = n > 0; foot.hidden = n === 0;
    var ship = n === 0 || (FREE && s >= FREE) ? 0 : SHIP;
    sub.textContent = fmt(s); del.textContent = ship ? fmt(ship) : L.free; tot.textContent = fmt(s + ship);
    badge.forEach(function (b) { b.textContent = n; b.hidden = n === 0; });
    save();
  }
  function open() { drawer.hidden = false; requestAnimationFrame(function () { drawer.classList.add("on"); }); document.body.style.overflow = "hidden"; drawer.querySelector(".cart-close").focus(); }
  function close() { drawer.classList.remove("on"); document.body.style.overflow = ""; setTimeout(function () { drawer.hidden = true; }, 300); }
  document.querySelectorAll("[data-add]").forEach(function (b) {
    b.addEventListener("click", function () {
      var k = b.dataset.add, it = items[k] || { n: b.dataset.name, p: parseFloat(b.dataset.price), img: b.dataset.img, q: 0 }; it.q++; items[k] = it; render();
      var t = b.textContent; b.textContent = L.added; b.classList.add("ok"); setTimeout(function () { b.textContent = t; b.classList.remove("ok"); }, 1200);
    });
  });
  list.addEventListener("click", function (e) {
    var li = e.target.closest("li"); if (!li) return; var k = li.dataset.k;
    if (e.target.closest("[data-inc]")) items[k].q++; else if (e.target.closest("[data-dec]")) { if (--items[k].q <= 0) delete items[k]; } else if (e.target.closest("[data-rm]")) delete items[k]; else return;
    render();
  });
  openers.forEach(function (o) { o.addEventListener("click", function (e) { e.preventDefault(); open(); }); });
  drawer.querySelectorAll(".cart-close, .cart-continue").forEach(function (b) { b.addEventListener("click", close); });
  drawer.addEventListener("click", function (e) { if (e.target === drawer) close(); });
  addEventListener("keydown", function (e) { if (e.key === "Escape" && !drawer.hidden) close(); });
  drawer.querySelector("[data-checkout]").addEventListener("click", function () { close(); done.hidden = true; form.hidden = false; dlg.showModal(); });
  dlg.querySelectorAll(".co-close").forEach(function (b) { b.addEventListener("click", function () { dlg.close(); }); });
  form.addEventListener("submit", function (e) {
    e.preventDefault(); if (!form.checkValidity()) { form.reportValidity(); return; }
    var no = "CS-" + String(Date.now()).slice(-6), s = 0; for (var k in items) s += items[k].p * items[k].q; var ship = FREE && s >= FREE ? 0 : SHIP;
    done.querySelector("[data-no]").textContent = no; done.querySelector("[data-sum]").textContent = fmt(s + ship); done.querySelector("[data-pay]").textContent = form.querySelector('[name="pay"]:checked').parentNode.textContent.trim();
    form.hidden = true; done.hidden = false; items = {}; render(); form.reset();
  });
  render();
})();
