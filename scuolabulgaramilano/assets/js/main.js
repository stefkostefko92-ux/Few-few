/* Qui Bulgaria — interactions
   Mobile nav, sticky header, scroll-reveal, active section highlight,
   animated counters and accessible contact form (mailto fallback). */
(function () {
  "use strict";
  const doc = document;
  const body = doc.body;

  /* ---------- Sticky header shadow ---------- */
  const header = doc.querySelector(".header");
  const onScroll = () => header.classList.toggle("is-scrolled", window.scrollY > 12);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  /* ---------- Mobile menu ---------- */
  const toggle = doc.querySelector(".nav__toggle");
  const backdrop = doc.querySelector(".menu-backdrop");
  const closeMenu = () => {
    body.classList.remove("menu-open");
    toggle && toggle.setAttribute("aria-expanded", "false");
  };
  if (toggle) {
    toggle.addEventListener("click", () => {
      const open = body.classList.toggle("menu-open");
      toggle.setAttribute("aria-expanded", String(open));
    });
  }
  backdrop && backdrop.addEventListener("click", closeMenu);
  doc.querySelectorAll(".nav__menu a").forEach((a) => a.addEventListener("click", closeMenu));
  doc.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenu(); });

  /* ---------- Scroll reveal ---------- */
  const reveals = doc.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) { en.target.classList.add("is-visible"); io.unobserve(en.target); }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add("is-visible"));
  }

  /* ---------- Animated counters ---------- */
  const counters = doc.querySelectorAll("[data-count]");
  const runCount = (el) => {
    const target = parseFloat(el.dataset.count);
    const suffix = el.dataset.suffix || "";
    const dur = 1400; const start = performance.now();
    const step = (now) => {
      const p = Math.min((now - start) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased).toLocaleString("it-IT") + suffix;
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  if ("IntersectionObserver" in window) {
    const co = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { runCount(en.target); co.unobserve(en.target); } });
    }, { threshold: 0.6 });
    counters.forEach((el) => co.observe(el));
  } else {
    counters.forEach((el) => { el.textContent = el.dataset.count + (el.dataset.suffix || ""); });
  }

  /* ---------- Active nav on scroll ---------- */
  const navLinks = Array.from(doc.querySelectorAll(".nav__link[data-section]"));
  const sections = navLinks.map((l) => doc.getElementById(l.dataset.section)).filter(Boolean);
  if (sections.length) {
    const so = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) {
          const id = en.target.id;
          navLinks.forEach((l) => l.classList.toggle("is-active", l.dataset.section === id));
        }
      });
    }, { threshold: 0.25, rootMargin: "-45% 0px -50% 0px" });
    sections.forEach((s) => so.observe(s));
  }

  /* ---------- Contact form (mailto) ---------- */
  const form = doc.querySelector("#contact-form");
  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const data = new FormData(form);
      const name = (data.get("name") || "").toString().trim();
      const email = (data.get("email") || "").toString().trim();
      const topic = (data.get("topic") || "").toString();
      const message = (data.get("message") || "").toString().trim();
      const status = form.querySelector(".form-status");
      if (!name || !email || !message) {
        status.textContent = "Compila tutti i campi obbligatori.";
        status.className = "form-status";
        return;
      }
      const subject = encodeURIComponent(`[Sito] ${topic || "Richiesta informazioni"} — ${name}`);
      const bodyText = encodeURIComponent(
        `Nome: ${name}\nEmail: ${email}\nInteresse: ${topic}\n\n${message}`
      );
      window.location.href = `mailto:centroquibulgaria@gmail.com?subject=${subject}&body=${bodyText}`;
      status.textContent = "Grazie! Si aprirà il tuo client di posta per inviare il messaggio.";
      status.className = "form-status ok";
      form.reset();
    });
  }

  /* ---------- Facebook feed (consent-gated) ---------- */
  const fbEmbed = doc.querySelector("#fb-embed");
  if (fbEmbed) {
    const href = fbEmbed.dataset.fbhref;
    const STORE_KEY = "qb-fb-consent";
    const loadFeed = () => {
      const consent = doc.querySelector("#fb-consent");
      if (consent) consent.classList.add("is-loading");
      const width = Math.min(520, Math.max(320, Math.round(fbEmbed.clientWidth)));
      const height = 600;
      const src =
        "https://www.facebook.com/plugins/page.php?href=" + encodeURIComponent(href) +
        "&tabs=timeline&width=" + width + "&height=" + height +
        "&small_header=false&adapt_container_width=true&hide_cover=false&show_facepile=true";
      const iframe = doc.createElement("iframe");
      iframe.src = src;
      iframe.title = "Post recenti da Facebook — Qui Bulgaria";
      iframe.width = String(width);
      iframe.height = String(height);
      iframe.loading = "lazy";
      iframe.setAttribute("scrolling", "no");
      iframe.setAttribute("frameborder", "0");
      iframe.allow = "encrypted-media; clipboard-write; web-share";
      iframe.referrerPolicy = "no-referrer-when-downgrade";
      iframe.addEventListener("load", () => { fbEmbed.innerHTML = ""; fbEmbed.appendChild(iframe); });
      // Append immediately (hidden behind consent) so the load event swaps it in.
      iframe.style.width = "100%";
      fbEmbed.appendChild(iframe);
    };
    const loadBtn = doc.querySelector("#fb-load");
    if (loadBtn) {
      loadBtn.addEventListener("click", () => {
        try { localStorage.setItem(STORE_KEY, "1"); } catch (e) {}
        loadFeed();
      });
    }
    // Auto-load if the visitor already consented in a previous visit.
    try { if (localStorage.getItem(STORE_KEY) === "1") loadFeed(); } catch (e) {}
  }

  /* ---------- Year ---------- */
  const y = doc.querySelector("#year");
  if (y) y.textContent = new Date().getFullYear();
})();
