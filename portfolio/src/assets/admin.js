// admin.js — мокът на админ панела: полетата (data-bind) пишат в прегледа (data-pv) при всяко натискане;
// смяна на снимка чете файла локално (FileReader, нищо не се качва); „Публикувай" → тост + история;
// „Върни" възстановява началните стойности. Състоянието живее само в паметта на страницата.
(function () {
  var app = document.querySelector("[data-admin]"); if (!app) return;
  var L = {}; try { L = JSON.parse(app.dataset.admin || "{}"); } catch (e) {}
  var binds = app.querySelectorAll("[data-bind]"), initial = {}, dirty = {}, hist = app.querySelector("[data-history]"), toast = document.querySelector("[data-toast]"), dirtyEl = app.querySelector("[data-dirty]");
  function val(el) { return el.type === "checkbox" ? el.checked : el.value; }
  function apply(el) {
    var k = el.dataset.bind, v = val(el);
    if (k.indexOf("lang-") === 0) { var s = app.querySelector('[data-pv-lang="' + k.slice(5) + '"]'); if (s) s.hidden = !v; }
    else if (/^r\d+on$/.test(k)) { var r = app.querySelector('[data-pv-review="' + k.slice(1, -2) + '"]'); if (r) r.hidden = !v; }
    else { var pv = app.querySelector('[data-pv="' + k + '"]'); if (pv) pv.textContent = v; }
    if (v !== initial[k]) dirty[k] = true; else delete dirty[k];
    var n = Object.keys(dirty).length; dirtyEl.hidden = !n; dirtyEl.textContent = n + " " + L.changed;
  }
  binds.forEach(function (el) { initial[el.dataset.bind] = val(el); el.addEventListener("input", function () { apply(el); }); el.addEventListener("change", function () { apply(el); }); });
  app.querySelectorAll("[data-file]").forEach(function (inp) {
    inp.addEventListener("change", function () {
      var f = inp.files && inp.files[0]; if (!f || !/^image\//.test(f.type)) return;
      var rd = new FileReader(); rd.onload = function () { var slot = inp.dataset.file; app.querySelector('[data-photo="' + slot + '"]').src = rd.result; app.querySelectorAll('[data-pv-photo="' + slot + '"]').forEach(function (i) { i.src = rd.result; }); dirty["photo-" + slot] = true; dirtyEl.hidden = false; dirtyEl.textContent = Object.keys(dirty).length + " " + L.changed; }; rd.readAsDataURL(f);
    });
  });
  app.querySelectorAll("[data-pane]").forEach(function (b) { b.addEventListener("click", function () { app.querySelectorAll("[data-pane]").forEach(function (x) { x.classList.toggle("on", x === b); }); app.querySelectorAll("[data-pane-body]").forEach(function (p) { p.hidden = p.dataset.paneBody !== b.dataset.pane; }); }); });
  app.querySelector("[data-save]").addEventListener("click", function () {
    var keys = Object.keys(dirty); if (!keys.length) { show(L.saved); return; }
    var none = hist.querySelector(".ad-none"); if (none) none.remove();
    var li = document.createElement("li"); li.innerHTML = "<b>" + new Date().toLocaleTimeString().slice(0, 5) + "</b> " + keys.length + " " + L.changed; hist.prepend(li);
    binds.forEach(function (el) { initial[el.dataset.bind] = val(el); }); dirty = {}; dirtyEl.hidden = true; show(L.saved);
  });
  app.querySelector("[data-undo]").addEventListener("click", function () { binds.forEach(function (el) { if (el.type === "checkbox") el.checked = initial[el.dataset.bind]; else el.value = initial[el.dataset.bind]; apply(el); }); });
  var tm; function show(msg) { toast.textContent = msg; toast.hidden = false; clearTimeout(tm); tm = setTimeout(function () { toast.hidden = true; }, 2200); }
})();
