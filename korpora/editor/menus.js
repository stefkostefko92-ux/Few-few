// The download list and the checks open over the editor as small menus (<details>): Escape closes the open one and
// gives the focus back to its button, a click anywhere else closes it too — the browser's <details> does neither.
export function bindMenus(menus) {
  const close = (menu) => {
    const inside = menu.contains(document.activeElement);
    menu.open = false;
    if (inside) menu.querySelector(':scope > summary')?.focus();
  };
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    const open = menus.filter((m) => m.open);
    if (!open.length) return;
    ev.preventDefault();
    open.forEach(close);
  });
  document.addEventListener('click', (ev) => {
    for (const m of menus) if (m.open && !m.contains(ev.target)) m.open = false;
  });
}
