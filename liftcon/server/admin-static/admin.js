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
  // Изход: документите на устройството (офлайн приложението) се трият; ако има несинхронизирани — питаме.
  document.querySelectorAll('form[action="/admin/logout"]').forEach((f) => {
    f.addEventListener("submit", (e) => {
      if (f.dataset.pulito || !("indexedDB" in window)) return;
      e.preventDefault();
      const fine = () => {
        f.dataset.pulito = "1";
        const del = indexedDB.deleteDatabase("liftcon-documenti");
        const vai = () => ("caches" in window ? caches.keys().then((k) => Promise.all(k.filter((x) => x.startsWith("liftcon-doc-dati")).map((x) => caches.delete(x)))) : Promise.resolve()).finally(() => f.submit());
        del.onsuccess = del.onerror = del.onblocked = vai;
      };
      const r = indexedDB.open("liftcon-documenti");
      r.onerror = fine;
      r.onsuccess = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains("documenti")) return db.close(), fine();
        const t = db.transaction(["documenti", "foto", "coda"], "readonly");
        let n = 0;
        t.objectStore("documenti").getAll().onsuccess = (ev) => (n += ev.target.result.filter((x) => x.sporco).length);
        t.objectStore("foto").getAll().onsuccess = (ev) => (n += ev.target.result.filter((x) => !x.caricata).length);
        t.objectStore("coda").count().onsuccess = (ev) => (n += ev.target.result);
        t.oncomplete = () => {
          db.close();
          if (n && !confirm(`Ci sono ${n} modifiche ai documenti non ancora sincronizzate su questo dispositivo: uscendo andranno perse. Uscire comunque?`)) return;
          fine();
        };
      };
    });
  });
  // PWA: service worker-ът на приложението (обхват /admin/) — инсталиране и документите без връзка.
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/admin/sw.js", { scope: "/admin/" }).catch(() => {});
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
