// V.F.R. — минимална клиентска логика: меню, reveal при скрол, активна секция, карта по клик.
// Без зависимости. Всичко деградира грациозно без JS (reveal е само с клас .js).
(() => {
  const html = document.documentElement;
  html.classList.add("js");

  const nav = document.getElementById("nav");
  const toggle = document.getElementById("nav-toggle");
  const links = document.getElementById("nav-links");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Меню (мобилно)
  if (toggle && links) {
    toggle.addEventListener("click", () => {
      const open = links.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Chiudi il menu" : "Apri il menu");
    });
    links.addEventListener("click", (e) => {
      if (e.target.closest("a")) { links.classList.remove("open"); toggle.setAttribute("aria-expanded", "false"); }
    });
  }

  // Сянка на навигацията след скрол
  const onScroll = () => nav && nav.classList.toggle("scrolled", window.scrollY > 12);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  // Reveal — само ако има IntersectionObserver и няма reduced-motion
  const items = document.querySelectorAll(".reveal");
  if (reduced || !("IntersectionObserver" in window)) {
    items.forEach((el) => el.classList.add("in"));
  } else {
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    items.forEach((el) => io.observe(el));
  }

  // Активна секция в менюто
  const sections = [...document.querySelectorAll("main section[id]")];
  const navAnchors = links ? [...links.querySelectorAll("a[href^='#']")] : [];
  if (sections.length && navAnchors.length && "IntersectionObserver" in window) {
    const spy = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        navAnchors.forEach((a) => a.classList.toggle("active", a.getAttribute("href") === `#${en.target.id}`));
      }
    }, { rootMargin: "-40% 0px -55% 0px" });
    sections.forEach((s) => spy.observe(s));
  }

  // Карта — Google Maps се зарежда САМО след клик (нула заявки към Google преди съгласие).
  const mapBtn = document.getElementById("map-load");
  const map = document.getElementById("map");
  if (mapBtn && map) {
    mapBtn.addEventListener("click", () => {
      const f = document.createElement("iframe");
      f.src = "https://www.google.com/maps?q=Via+Monte+Grappa+6,+22073+Fino+Mornasco+CO&output=embed&hl=it";
      f.title = "Mappa: Via Monte Grappa 6, Fino Mornasco";
      f.loading = "lazy";
      f.referrerPolicy = "no-referrer-when-downgrade";
      f.allowFullscreen = true;
      map.replaceChildren(f);
    });
  }

  const y = document.getElementById("year");
  if (y) y.textContent = String(new Date().getFullYear());
})();
