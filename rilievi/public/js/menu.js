// The side bar on a phone or a tablet (under 1100 px): ☰ opens it from the left over the page, which
// goes inert behind it (focus stays in the bar); the close button, the backdrop, Esc or a wider window
// close it, and focus goes back to ☰. On a computer the bar is always there and nothing here runs.
(() => {
  const bar = document.querySelector('[data-sidenav]');
  const opener = document.querySelector('[data-nav-open]');
  const backdrop = document.querySelector('.sidenav__backdrop');
  if (!bar || !opener || !backdrop) return;
  const wide = window.matchMedia('(min-width: 1100px)');
  const behind = () =>
    Array.from(document.body.children).filter(
      (el) => el !== bar && el !== backdrop && el.tagName !== 'SCRIPT',
    );

  const open = () => {
    bar.setAttribute('data-open', '');
    backdrop.hidden = false;
    opener.setAttribute('aria-expanded', 'true');
    document.body.classList.add('nav-open');
    for (const el of behind()) el.inert = true;
    bar.querySelector('.sidenav__close')?.focus();
  };
  const close = (restoreFocus) => {
    if (!bar.hasAttribute('data-open')) return;
    bar.removeAttribute('data-open');
    backdrop.hidden = true;
    opener.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('nav-open');
    for (const el of behind()) el.inert = false;
    if (restoreFocus) opener.focus();
  };

  opener.addEventListener('click', open);
  for (const el of document.querySelectorAll('[data-nav-close]'))
    el.addEventListener('click', () => close(true));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && bar.hasAttribute('data-open')) {
      event.preventDefault();
      close(true);
    }
  });
  wide.addEventListener('change', () => close(false));
})();
