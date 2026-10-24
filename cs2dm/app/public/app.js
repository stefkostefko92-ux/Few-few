// Единственият скрипт на сайта — прогресивно подобрение, всичко останало работи без него:
//  1) бутонът „Копирай“ до командата за конзолата (без JS остава скрит, командата се маркира на ръка);
//  2) превключвателят „Спри анимациите“ (WCAG 2.2.2): слага `calm` на <html> и CSS спира целия декор.
(() => {
  const status = document.querySelector('[data-copy-status]');
  for (const button of document.querySelectorAll('button[data-copy-target]')) {
    const target = document.getElementById(button.dataset.copyTarget || '');
    if (!target || !navigator.clipboard) continue;
    const label = button.textContent;
    button.hidden = false;
    button.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(target.textContent.trim());
        button.textContent = button.dataset.copied || label;
      } catch {
        button.textContent = label;
        if (status) status.textContent = button.dataset.failed || '';
        return;
      }
      if (status) status.textContent = button.dataset.copied || '';
      window.setTimeout(() => {
        button.textContent = label;
      }, 2000);
    });
  }
})();

(() => {
  const button = document.querySelector('[data-motion-toggle]');
  // При `prefers-reduced-motion` CSS вече е спрял декора — превключвател не е нужен.
  if (!button || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  button.hidden = false;
  button.addEventListener('click', () => {
    const calm = document.documentElement.classList.toggle('calm');
    button.setAttribute('aria-pressed', String(calm));
    button.textContent = (calm ? button.dataset.play : button.dataset.pause) || button.textContent;
  });
})();
