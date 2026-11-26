// LiftCon — малко клиентска логика: меню, хедър при скрол, форма (fetch), карта при клик.
// Без зависимости и без бисквитки/localStorage. Страницата работи и без този файл.
(() => {
  "use strict";
  const header = document.querySelector("[data-header]");
  const menuBtn = document.querySelector(".menu-btn");
  const nav = document.getElementById("nav");
  const mq = window.matchMedia("(max-width: 1099px)");

  // Хедърът получава линия отдолу след първите пиксели скрол.
  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      header?.classList.toggle("is-scrolled", window.scrollY > 8);
      ticking = false;
    });
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // Падащите панели: бутон с aria-expanded; Esc и клик извън затварят.
  const items = [...document.querySelectorAll(".nav-item.has-panel")];
  const setOpen = (li, open) => {
    li.classList.toggle("is-open", open);
    li.querySelector(".nav-toggle")?.setAttribute("aria-expanded", String(open));
  };
  const closeAll = (except) => items.forEach((li) => li !== except && setOpen(li, false));
  items.forEach((li) => {
    const btn = li.querySelector(".nav-toggle");
    btn?.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = !li.classList.contains("is-open");
      if (!mq.matches) closeAll(li);
      setOpen(li, open);
    });
    // Бутон без връзка („Per chi“): етикетът отваря панела.
    li.querySelector(".nav-label")?.addEventListener("click", () => btn?.click());
  });
  document.addEventListener("click", (e) => {
    if (!mq.matches && !e.target.closest(".nav-item.has-panel")) closeAll();
  });

  // Мобилното чекмедже.
  const setDrawer = (open) => {
    if (!header || !menuBtn) return;
    if (open) header.setAttribute("data-open", "");
    else header.removeAttribute("data-open");
    menuBtn.setAttribute("aria-expanded", String(open));
    menuBtn.querySelector(".sr").textContent = open ? "Chiudi il menu" : "Apri il menu";
    document.body.classList.toggle("menu-open", open);
    if (open) nav?.querySelector("a, button")?.focus();
  };
  menuBtn?.addEventListener("click", () => setDrawer(!header.hasAttribute("data-open")));
  nav?.addEventListener("click", (e) => {
    if (e.target.closest("a") && mq.matches) setDrawer(false);
  });
  mq.addEventListener("change", () => {
    setDrawer(false);
    closeAll();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const open = items.find((li) => li.classList.contains("is-open"));
    if (open) {
      setOpen(open, false);
      open.querySelector(".nav-toggle")?.focus();
    } else if (header?.hasAttribute("data-open")) {
      setDrawer(false);
      menuBtn?.focus();
    }
  });

  // Формата за контакт.
  const form = document.querySelector("[data-form]");
  if (form) {
    const status = form.querySelector("[data-status]");
    const t = form.querySelector("[data-t]");
    // Изминалото време от зареждането (не часовникът на устройството, който може да избързва).
    let started = performance.now();
    const wanted = new URLSearchParams(location.search).get("servizio");
    const sel = form.querySelector("#f-servizio");
    if (wanted && sel && [...sel.options].some((o) => o.value === wanted)) sel.value = wanted;

    const say = (text, state) => {
      status.textContent = text;
      status.dataset.state = state;
    };
    form.addEventListener("input", (e) => e.target.removeAttribute?.("aria-invalid"));
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const invalid = [...form.elements].filter((el) => el.willValidate && !el.checkValidity());
      invalid.forEach((el) => el.setAttribute("aria-invalid", "true"));
      if (invalid.length) {
        const names = invalid.map((el) => form.querySelector(`label[for="${el.id}"]`)?.childNodes[0]?.textContent.trim()).filter(Boolean);
        say(`Controlli questi campi: ${names.join(", ")}.`, "err");
        invalid[0].focus();
        return;
      }
      if (t) t.value = String(Math.round(performance.now() - started));
      const btn = form.querySelector("button[type=submit]");
      btn.disabled = true;
      say("Invio in corso…", "");
      try {
        const res = await fetch(form.action, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(Object.fromEntries(new FormData(form))),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.ok) {
          form.reset();
          started = performance.now();
          say("Richiesta inviata. Le risponderemo all'indirizzo email indicato.", "ok");
        } else if (res.status === 429) {
          say("Troppe richieste in poco tempo. Riprovi tra qualche minuto o ci chiami.", "err");
        } else {
          say(data.message || "La richiesta non è partita. Controlli i dati o ci chiami al numero indicato.", "err");
        }
      } catch {
        say("Connessione non riuscita: la richiesta non è partita. Riprovi o ci chiami al numero indicato.", "err");
      } finally {
        btn.disabled = false;
      }
    });
  }

  // Картата се зарежда само при изричен клик (поверителност: OpenStreetMap получава IP адреса).
  document.querySelectorAll("[data-map-load]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const box = btn.closest("[data-map]");
      const src = btn.getAttribute("data-src");
      if (!box || !src || !src.startsWith("https://www.openstreetmap.org/")) return;
      const iframe = document.createElement("iframe");
      iframe.src = src;
      iframe.title = "Mappa della Lombardia, zona servita da LiftCon (OpenStreetMap)";
      iframe.loading = "lazy";
      iframe.referrerPolicy = "no-referrer";
      box.replaceChildren(iframe);
    });
  });
})();
