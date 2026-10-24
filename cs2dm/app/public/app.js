// Единственият скрипт на сайта — прогресивно подобрение: бутонът „Копирай“ до командата за
// конзолата. Без JavaScript бутонът остава скрит, а командата се маркира и копира на ръка.
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
