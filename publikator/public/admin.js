// Минимално: потвърждение на разрушителни действия + автоматично скриване на flash.
document.querySelectorAll('form[data-confirm]').forEach((form) => {
  form.addEventListener('submit', (event) => {
    if (!window.confirm(form.getAttribute('data-confirm'))) event.preventDefault();
  });
});
const flash = document.querySelector('.flash');
if (flash) setTimeout(() => flash.remove(), 8000);
