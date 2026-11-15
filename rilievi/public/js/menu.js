// The side bar on a phone or a tablet (under 1100 px): "Menu" in the bottom bar or the rail (or ☰ at the
// top, on the pages where the bottom bar steps aside) opens it from the left over the page, which goes
// inert behind it (focus stays in the bar); the close button, the backdrop, Esc or a wider window close
// it, and focus goes back to the button that opened it. On a computer the bar is always there.
// "Nuovo" (a <details>, works without JavaScript) closes with Esc or a click outside it.
(() => {
  const bar = document.querySelector('[data-sidenav]');
  const openers = Array.from(document.querySelectorAll('[data-nav-open]'));
  const backdrop = document.querySelector('.sidenav__backdrop');
  if (!bar || openers.length === 0 || !backdrop) return;
  const wide = window.matchMedia('(min-width: 1100px)');
  let opener = openers[0];
  const behind = () =>
    Array.from(document.body.children).filter(
      (el) => el !== bar && el !== backdrop && el.tagName !== 'SCRIPT',
    );

  for (const el of openers) {
    // The link "Menu" (#sidenav without JavaScript) becomes a button that opens the bar.
    if (el.tagName === 'A') el.setAttribute('role', 'button');
    el.setAttribute('aria-expanded', 'false');
  }

  const open = (from) => {
    opener = from;
    bar.setAttribute('data-open', '');
    backdrop.hidden = false;
    for (const el of openers) el.setAttribute('aria-expanded', 'true');
    document.body.classList.add('nav-open');
    for (const el of behind()) el.inert = true;
    bar.querySelector('.sidenav__close')?.focus();
  };
  const close = (restoreFocus) => {
    if (!bar.hasAttribute('data-open')) return;
    bar.removeAttribute('data-open');
    backdrop.hidden = true;
    for (const el of openers) el.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('nav-open');
    for (const el of behind()) el.inert = false;
    if (restoreFocus) opener.focus();
  };

  for (const el of openers)
    el.addEventListener('click', (event) => {
      event.preventDefault();
      open(el);
    });
  for (const el of document.querySelectorAll('[data-nav-close]'))
    el.addEventListener('click', () => close(true));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && bar.hasAttribute('data-open')) {
      event.preventDefault();
      close(true);
    }
  });
  wide.addEventListener('change', () => close(false));

  const nuovo = document.querySelector('[data-nuovo]');
  if (nuovo) {
    document.addEventListener('click', (event) => {
      if (nuovo.open && event.target instanceof Node && !nuovo.contains(event.target))
        nuovo.open = false;
    });
    nuovo.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && nuovo.open) {
        event.stopPropagation();
        nuovo.open = false;
        nuovo.querySelector('summary')?.focus();
      }
    });
  }
})();
