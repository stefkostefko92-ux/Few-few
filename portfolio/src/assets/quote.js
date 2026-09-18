// quote.js — конфигураторът на оферта: чете data-quote (нето цени от src/pricing.mjs), смята редове,
// нето, ДДС по типа клиент и общо (еднократно + месечно), пише mailto с готово тяло и печата. Нула зависимости.
(function () {
  var f = document.getElementById("quote"); if (!f) return;
  var C = JSON.parse(f.dataset.quote), L = C.labels;
  var fmt = function (n) { var s = String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, C.sep); return C.pre ? "€" + s : s + " €"; };
  var lines = f.querySelector("[data-lines]"), netEl = f.querySelector("[data-net]"), vatEl = f.querySelector("[data-vat]"), vatRow = f.querySelector("[data-vatrow]"), totEl = f.querySelector("[data-total]"), moRow = f.querySelector("[data-monthlyrow]"), moEl = f.querySelector("[data-monthly]"), delEl = f.querySelector("[data-delivery]"), note = f.querySelector("[data-vatnote]"), mail = f.querySelector("[data-mail]");
  var VAT = { bgCompany: 0.2, bgPrivate: 0.2, euCompany: 0, euPrivate: 0.2, nonEu: 0 }, NOTE = { bgCompany: "bg", bgPrivate: "bg", euCompany: "eu", euPrivate: "euPrivate", nonEu: "nonEu" };
  function calc() {
    var tierId = (f.querySelector('[name="tier"]:checked') || {}).value, tier = C.tiers.filter(function (t) { return t.id === tierId; })[0];
    var client = (f.querySelector('[name="client"]:checked') || {}).value || "bgCompany", rate = VAT[client];
    var once = 0, monthly = 0, rows = [];
    if (tier) { once += tier.net; rows.push([tier.name, fmt(tier.net), ""]); }
    C.addons.forEach(function (a) {
      var el = f.querySelector('[name="' + a.id + '"]'), n = el.type === "checkbox" ? (el.checked ? 1 : 0) : Math.max(0, parseInt(el.value, 10) || 0); if (!n) return;
      if (a.kind === "monthly") { monthly += a.net; once += a.net * n; rows.push([a.name + " × " + n + " " + L.months, fmt(a.net * n), fmt(a.net) + " " + L.monthly.toLowerCase()]); }
      else { once += a.net * n; rows.push([a.name + (n > 1 ? " × " + n : ""), fmt(a.net * n), ""]); }
    });
    lines.innerHTML = rows.length ? rows.map(function (r) { return "<li><span>" + r[0] + "</span><b>" + r[1] + "</b>" + (r[2] ? "<i>" + r[2] + "</i>" : "") + "</li>"; }).join("") : "<li class=\"q-empty\">" + L.empty + "</li>";
    var vat = Math.round(once * rate), total = once + vat;
    netEl.textContent = fmt(once); vatEl.textContent = fmt(vat); vatRow.hidden = !rate; totEl.textContent = fmt(total);
    moRow.hidden = !monthly; moEl.textContent = fmt(Math.round(monthly * (1 + rate)));
    note.textContent = L.vatNote[NOTE[client]]; delEl.textContent = tier ? L.delivery + ": " + tier.days[0] + "–" + tier.days[1] + " " + L.days : "";
    var body = L.mailIntro + "\n\n" + rows.map(function (r) { return "- " + r[0] + ": " + r[1] + (r[2] ? " (" + r[2] + ")" : ""); }).join("\n") + "\n\n" + L.net + ": " + fmt(once) + (rate ? "\n" + L.vat + ": " + fmt(vat) : "") + "\n" + L.total + ": " + fmt(total) + (monthly ? "\n" + L.totalMonthly + ": " + fmt(Math.round(monthly * (1 + rate))) : "") + "\n" + L.client[client] + " — " + L.vatNote[NOTE[client]] + "\n\n" + location.href;
    mail.href = "mailto:" + L.email + "?subject=" + encodeURIComponent(L.mailSubject) + "&body=" + encodeURIComponent(body);
  }
  f.addEventListener("input", calc); f.addEventListener("change", calc);
  f.addEventListener("reset", function () { setTimeout(calc, 0); });
  f.querySelectorAll("[data-inc],[data-dec]").forEach(function (b) { b.addEventListener("click", function () { var i = b.parentNode.querySelector("input"), v = parseInt(i.value, 10) || 0; v += b.hasAttribute("data-inc") ? 1 : -1; i.value = Math.min(+i.max, Math.max(+i.min, v)); calc(); }); });
  f.querySelector("[data-print]").addEventListener("click", function () { print(); });
  calc();
})();
