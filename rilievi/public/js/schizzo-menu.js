// The menus of the sketch editor ("Forme", "Simboli", "Stile" — <details> over the sheet): the face shows
// what is in use from it (the shape, the symbol); a tool or a symbol chosen with the pointer closes it,
// the focus back on its face. From the keyboard the focus goes into an open menu, on what is chosen, and
// the arrows go through it; Enter (and Esc — schizzo-comandi.js) closes it back to its face. The focus
// leaving a menu closes it, and reaching a closed one (the arrows go on past the tools) opens it.
(() => {
  'use strict';

  const ed = window.rilieviSchizzoEditor;
  if (!ed) return;
  const { dialog } = ed;
  const menus = Array.from(dialog.querySelectorAll('details[data-schizzo-menu]'));
  const summaryOf = (menu) => menu.querySelector('summary');
  const panelOf = (el) => (el instanceof Element ? el.closest('.menu__pannello') : null);

  const closeAll = (except = null) => {
    menus.forEach((m) => {
      if (m !== except) m.open = false;
    });
  };

  const sync = () => {
    const tool = dialog.querySelector('input[name="schizzo-strumento"]:checked').value;
    menus.forEach((menu) => {
      const own = menu.querySelector(`input[name="schizzo-strumento"][value="${tool}"]`);
      menu.classList.toggle('is-active', Boolean(own));
      if (!own) return;
      const symbol =
        tool === 'simbolo' && menu.querySelector('input[name="schizzo-simbolo"]:checked');
      const label = (symbol || own).closest('label');
      const icon = label && label.querySelector('svg');
      const face = menu.querySelector('[data-schizzo-menu-faccia]');
      if (face && icon) face.replaceChildren(icon.cloneNode(true));
    });
  };

  // Opened: the focus on the choice in it (or the first one) — unless it is there already.
  menus.forEach((menu) => {
    menu.addEventListener('toggle', () => {
      const active = document.activeElement;
      if (!menu.open || (panelOf(active) && menu.contains(active) && active.tabIndex !== -1))
        return;
      const inputs = Array.from(
        menu.querySelectorAll('.menu__pannello input:not([tabindex="-1"])'),
      );
      const target = inputs.find((input) => input.checked) || inputs[0];
      if (target) target.focus({ preventScroll: true });
    });
  });

  dialog.addEventListener('click', (event) => {
    const { name } = event.target;
    if (event.detail === 0 || (name !== 'schizzo-strumento' && name !== 'schizzo-simbolo')) return;
    const own = event.target.closest('details[data-schizzo-menu]');
    closeAll();
    if (own) summaryOf(own).focus({ preventScroll: true });
  });

  dialog.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || !(event.target instanceof HTMLInputElement)) return;
    const panel = panelOf(event.target);
    if (!panel) return;
    event.preventDefault();
    const menu = panel.closest('details');
    menu.open = false;
    summaryOf(menu).focus();
  });

  dialog.addEventListener('focusin', (event) => {
    const own = event.target instanceof Element ? event.target.closest('details') : null;
    closeAll(own);
    if (own && !own.open && panelOf(event.target)) own.open = true;
  });

  // A tap on the sheet closes them.
  ed.canvas.addEventListener('pointerdown', () => closeAll());

  ed.menus = { list: menus, sync, closeAll, summaryOf };
})();
