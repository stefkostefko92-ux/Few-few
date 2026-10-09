/* Контакти: (1) карта само след клик; (2) запитване, което се съставя като писмо.
   Нищо не се изпраща през този сайт и не се записва в браузъра — няма сървър, бисквитки или localStorage. */
(function () {
  "use strict";

  /* 1. Google Maps — зарежда се САМО след изричен клик (Google може да постави бисквитки). */
  var mapBtn = document.querySelector("[data-map-load]");
  var mapBox = document.querySelector("[data-map-box]");
  if (mapBtn && mapBox) {
    mapBtn.addEventListener("click", function () {
      var f = document.createElement("iframe");
      f.title = "Карта: ул. „Димитър Благоев“ 16, Бобов дол";
      f.src = mapBtn.getAttribute("data-map-src");
      f.loading = "lazy";
      f.referrerPolicy = "no-referrer-when-downgrade";
      f.setAttribute("allowfullscreen", "");
      mapBox.replaceChildren(f);
    });
  }

  /* 2. Запитване → писмо в пощенската програма на посетителя. */
  var form = document.querySelector("[data-mail-form]");
  if (!form) return;
  form.hidden = false;
  var fallback = document.querySelector("[data-no-js]");
  if (fallback) fallback.hidden = true;

  var TO = form.getAttribute("data-to");
  var status = form.querySelector("[data-status]");
  var copyBtn = form.querySelector("[data-copy]");

  function val(name) { var el = form.elements[name]; return el ? el.value.trim() : ""; }

  function validate() {
    var ok = true, first = null;
    ["name", "email", "message"].forEach(function (n) {
      var el = form.elements[n];
      var bad = !el.value.trim() || (n === "email" && !el.checkValidity());
      el.setAttribute("aria-invalid", bad ? "true" : "false");
      if (bad) { ok = false; if (!first) first = el; }
    });
    if (!ok && first) first.focus();
    return ok;
  }

  function compose() {
    var service = val("service");
    var lines = [
      "Здравейте,", "",
      val("message"), "",
      "Име: " + val("name"),
      "Имейл: " + val("email")
    ];
    if (val("phone")) lines.push("Телефон: " + val("phone"));
    if (service) lines.push("Интересувам се от: " + service);
    return {
      subject: "Запитване от сайта" + (service ? " — " + service : ""),
      body: lines.join("\n")
    };
  }

  // Ново въвеждане маха червеното състояние.
  form.addEventListener("input", function (e) {
    if (e.target.getAttribute && e.target.getAttribute("aria-invalid") === "true") e.target.setAttribute("aria-invalid", "false");
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    status.textContent = "";
    if (!validate()) { status.textContent = "Моля, попълнете отбелязаните полета."; return; }
    var m = compose();
    window.location.href = "mailto:" + TO + "?subject=" + encodeURIComponent(m.subject) + "&body=" + encodeURIComponent(m.body);
    status.textContent = "Отваряме Вашата пощенска програма. Ако не се отвори, натиснете „Копирай писмото“ и го изпратете на " + TO + ".";
  });

  if (copyBtn) copyBtn.addEventListener("click", function () {
    status.textContent = "";
    if (!validate()) { status.textContent = "Моля, попълнете отбелязаните полета."; return; }
    var m = compose();
    var txt = "До: " + TO + "\nТема: " + m.subject + "\n\n" + m.body;
    var done = function () { status.textContent = "Писмото е копирано. Поставете го в имейл до " + TO + "."; };
    var fail = function () { status.textContent = "Копирането не успя. Пишете ни на " + TO + " или се обадете по телефона."; };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, fail); else fail();
  });
})();
