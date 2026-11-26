// LiftCon Admin: righe ripetibili (aggiungi, rimuovi, sposta) e contatori di caratteri. Senza dipendenze.
(() => {
  "use strict";
  document.addEventListener("click", (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    const gruppo = t.closest("[data-ripeti]");
    if (t.matches("[data-aggiungi]") && gruppo) {
      const tpl = gruppo.querySelector("template");
      if (tpl) t.before(tpl.content.cloneNode(true));
      gruppo.querySelectorAll(".riga").forEach((r, i) => r.querySelectorAll("[id]").forEach((el) => {
        const nuovo = el.id.replace(/_\d+$/, `_${i}`);
        r.querySelector(`label[for="${el.id}"]`)?.setAttribute("for", nuovo);
        el.id = nuovo;
      }));
      gruppo.querySelectorAll(".riga")[gruppo.querySelectorAll(".riga").length - 1]?.querySelector("input,textarea")?.focus();
    }
    const riga = t.closest(".riga");
    if (!riga) return;
    if (t.matches("[data-rimuovi]")) {
      if (gruppo && gruppo.querySelectorAll(".riga").length > 1) riga.remove();
      else riga.querySelectorAll("input,textarea").forEach((el) => (el.value = ""));
    } else if (t.matches("[data-su]") && riga.previousElementSibling?.classList.contains("riga")) {
      riga.previousElementSibling.before(riga);
    } else if (t.matches("[data-giu]") && riga.nextElementSibling?.classList.contains("riga")) {
      riga.nextElementSibling.after(riga);
    }
  });
  document.querySelectorAll("[data-max]").forEach((el) => {
    const out = document.createElement("p");
    out.className = "contatore";
    out.setAttribute("aria-live", "polite");
    el.after(out);
    const max = Number(el.getAttribute("data-max"));
    const min = Number(el.getAttribute("data-min") || 0);
    const agg = () => {
      const n = el.value.length;
      out.textContent = `${n} / ${max}`;
      out.classList.toggle("oltre", n > max || (min > 0 && n < min));
    };
    el.addEventListener("input", agg);
    agg();
  });
})();
