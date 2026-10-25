// Единственият скрипт на сайта — прогресивно подобрение, всичко останало работи без него:
//  1) менюто на телефон: бутонът „Меню“ сгъва/разгъва връзките (без JS те остават видими като ред);
//  2) бутоните „Копирай“ до командите (без JS остават скрити, командата се маркира на ръка).
document.documentElement.classList.add('js');

(() => {
  const toggle = document.querySelector('[data-menu-toggle]');
  const menu = document.querySelector('[data-menu]');
  if (!toggle || !menu) return;
  toggle.hidden = false;
  const close = () => {
    menu.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
  };
  toggle.addEventListener('click', () => {
    const open = menu.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(open));
  });
  menu.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('a')) close();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && menu.classList.contains('is-open')) {
      close();
      toggle.focus();
    }
  });
})();

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
