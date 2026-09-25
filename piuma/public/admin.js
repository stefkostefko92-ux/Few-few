// Единственият скрипт на панела (зареден с nonce): потвърждение на разрушително действие,
// скриване на еднократното съобщение, копиране в клипборда и рамка вместо счупена медия. Нищо от това не е нужно за работата —
// панелът е използваем и без JavaScript.
document.querySelectorAll('form[data-confirm]').forEach((form) => {
  form.addEventListener('submit', (event) => {
    if (!window.confirm(form.getAttribute('data-confirm'))) event.preventDefault();
  });
});

// Само еднократното потвърждение изчезва. Постоянните бележки на страницата (изтекъл токен,
// грешката на провален пост, резултатът от одит-веригата) и грешките остават, докато са верни.
const flash = document.querySelector('.flash[data-autohide]');
if (flash) setTimeout(() => flash.remove(), 8000);

// Медията е на външен адрес. Не се ли зареди, остава рамката с иконата, не счупено изображение.
document.querySelectorAll('img[data-fallback]').forEach((img) => {
  const hide = () => {
    img.hidden = true;
  };
  if (img.complete && img.naturalWidth === 0) hide();
  else img.addEventListener('error', hide);
});

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
