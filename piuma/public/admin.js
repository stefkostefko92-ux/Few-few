// Единственият скрипт на панела (зареден с nonce): потвърждение на разрушително действие,
// скриване на съобщението и копиране в клипборда. Нищо от това не е нужно за работата —
// панелът е използваем и без JavaScript.
document.querySelectorAll('form[data-confirm]').forEach((form) => {
  form.addEventListener('submit', (event) => {
    if (!window.confirm(form.getAttribute('data-confirm'))) event.preventDefault();
  });
});

const flash = document.querySelector('.flash');
if (flash) setTimeout(() => flash.remove(), 8000);

document.querySelectorAll('button[data-copy]').forEach((button) => {
  const label = button.innerHTML;
  button.addEventListener('click', async () => {
    const target = document.querySelector(button.getAttribute('data-copy'));
    if (!target) return;
    try {
      // Клипбордът иска сигурен контекст (https или localhost) — иначе казваме честно, че не е станало.
      await navigator.clipboard.writeText(target.textContent.trim());
      button.textContent = button.dataset.copied || 'OK';
    } catch {
      button.textContent = button.dataset.copyFailed || '×';
    }
    setTimeout(() => {
      button.innerHTML = label;
    }, 2500);
  });
});
