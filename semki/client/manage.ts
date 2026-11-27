// Страницата „Партиди“ (esbuild → public/js/manage.js, без three.js): плочка от дашборда отваря
// редакцията на партидата си (#b12), „Нова партида“ отваря формата, масовото триене казва колко са
// отметнати, а „Отметни всички“ отмята вида. Без JavaScript всичко работи — само по-малко удобно.

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function openFromHash(): void {
  const hash = location.hash;
  const batch = /^#b(\d+)$/.exec(hash);
  if (batch) {
    const row = document.getElementById(`b${batch[1]}`);
    if (!row) return;
    for (const r of document.querySelectorAll('.brow.is-target')) r.classList.remove('is-target');
    row.classList.add('is-target');
    const details = row.querySelector('details');
    if (details) details.open = true;
    row.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' });
    return;
  }
  if (hash === '#new') {
    const add = document.getElementById('new');
    if (add instanceof HTMLDetailsElement) {
      add.open = true;
      add.querySelector<HTMLElement>('input:not([type="hidden"]), select')?.focus();
    }
  }
}

function bulkCounter(): void {
  const btn = document.getElementById('bulk-btn');
  if (!(btn instanceof HTMLButtonElement)) return;
  const boxes = () => document.querySelectorAll<HTMLInputElement>('input[name="ids"][form="bulk"]');
  const update = () => {
    const n = [...boxes()].filter((b) => b.checked).length;
    btn.textContent = n > 0 ? `Изтрий отметнатите (${n})` : 'Изтрий отметнатите';
    btn.disabled = n === 0;
  };
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (!(t instanceof HTMLInputElement)) return;
    const group = t.dataset.pickAll;
    if (group) for (const b of boxes()) if (b.dataset.type === group) b.checked = t.checked;
    update();
  });
  for (const label of document.querySelectorAll<HTMLElement>('.pick-all')) label.hidden = false;
  update();
}

openFromHash();
addEventListener('hashchange', openFromHash);
bulkCounter();
