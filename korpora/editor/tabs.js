// The output tabs (3D, BOM, drilling, nesting, drawings, CNC, catalog): WAI-ARIA tabs with the arrow keys, one tab
// stop, the tab in the address (#draw) so a reload or a link opens it again.
import { $$ } from './dom.js';

export const TABS = ['view', 'bom', 'drill', 'nest', 'draw', 'cnc', 'cat'];

// Marks the tab and shows its panel; what the panel draws is the caller's (onShow).
export function showTab(id, focus = false) {
  for (const t of $$('[role="tab"]')) {
    const on = t.dataset.tab === id;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
    if (on && focus) t.focus();
  }
  for (const p of $$('[role="tabpanel"]')) p.hidden = p.id !== `panel-${id}`;
  if (history.replaceState) history.replaceState(null, '', `#${id}`);
}

export function bindTabs(select) {
  for (const t of $$('[role="tab"]')) {
    t.addEventListener('click', () => select(t.dataset.tab));
    t.addEventListener('keydown', (ev) => {
      const i = TABS.indexOf(t.dataset.tab);
      if (ev.key === 'ArrowRight') select(TABS[(i + 1) % TABS.length], true);
      else if (ev.key === 'ArrowLeft') select(TABS[(i + TABS.length - 1) % TABS.length], true);
      else return;
      ev.preventDefault();
    });
  }
}

// The tab named in the address opens first; a link or the address bar can change it later too (replaceState in
// showTab fires no hashchange).
export function followHash(select, current) {
  const named = () => location.hash.replace('#', '');
  select(TABS.includes(named()) ? named() : 'view');
  window.addEventListener('hashchange', () => {
    if (TABS.includes(named()) && named() !== current()) select(named());
  });
}
