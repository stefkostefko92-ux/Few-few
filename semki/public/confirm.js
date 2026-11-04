// Потвърждение преди триене: всяка форма с data-confirm пита първо. Без JavaScript формата
// просто се праща (отметките в дашборда са съзнателен избор и без това).
document.addEventListener('submit', (event) => {
  const form = event.target;
  if (
    form instanceof HTMLFormElement &&
    form.dataset.confirm &&
    !window.confirm(form.dataset.confirm)
  ) {
    event.preventDefault();
  }
});
