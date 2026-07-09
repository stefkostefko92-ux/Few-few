/* Eternal Touch — main.js */
(function () {
  'use strict';

  const $ = (s, c) => (c || document).querySelector(s);
  const $$ = (s, c) => Array.from((c || document).querySelectorAll(s));

  /* Header scroll state */
  const header = $('.site-header');
  if (header) {
    let last = 0;
    const onScroll = () => {
      const y = window.scrollY || window.pageYOffset;
      header.classList.toggle('scrolled', y > 24);
      last = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* Mobile menu */
  const menuToggle = $('.menu-toggle');
  const mobileDrawer = $('.mobile-drawer');
  if (menuToggle && mobileDrawer) {
    menuToggle.addEventListener('click', () => {
      const open = mobileDrawer.classList.toggle('open');
      menuToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      document.body.classList.toggle('menu-open', open);
    });
    $$('.mobile-drawer a').forEach(a =>
      a.addEventListener('click', () => {
        mobileDrawer.classList.remove('open');
        document.body.classList.remove('menu-open');
        menuToggle.setAttribute('aria-expanded', 'false');
      })
    );
  }

  /* Reveal-on-scroll */
  const reveals = $$('[data-reveal]');
  if (reveals.length && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      entries => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            e.target.classList.add('is-visible');
            io.unobserve(e.target);
          }
        });
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.08 }
    );
    reveals.forEach(el => io.observe(el));
  } else {
    reveals.forEach(el => el.classList.add('is-visible'));
  }

  /* Smooth anchor scroll */
  $$('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const id = a.getAttribute('href');
      if (id.length > 1 && $(id)) {
        e.preventDefault();
        $(id).scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  /* Contact form */
  const form = $('#contact-form');
  if (form) {
    const status = $('#contact-status');
    const submitBtn = form.querySelector('button[type="submit"]');
    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (status) {
        status.textContent = '';
        status.className = 'form-status';
      }
      submitBtn.disabled = true;
      const sendingText = submitBtn.dataset.sending || 'Sending...';
      const originalText = submitBtn.textContent;
      submitBtn.textContent = sendingText;

      try {
        const data = Object.fromEntries(new FormData(form).entries());
        const res = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        const json = await res.json();
        if (res.ok && json.ok) {
          status.textContent = json.message || form.dataset.sentText || 'Sent.';
          status.classList.add('success');
          form.reset();
        } else {
          status.textContent = json.error || form.dataset.errorText || 'Error.';
          status.classList.add('error');
        }
      } catch {
        status.textContent = form.dataset.errorText || 'Error.';
        status.classList.add('error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    });
  }

  /* Lazy fade-in for images */
  $$('img').forEach(img => {
    if (img.complete) img.classList.add('img-loaded');
    else img.addEventListener('load', () => img.classList.add('img-loaded'));
  });
})();
