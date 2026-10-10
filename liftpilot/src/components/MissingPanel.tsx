'use client';

import SectionTitle from '@/components/project/SectionTitle';

// What a form still needs before the software works anything out: each value, a link that opens its group and puts
// the cursor in its field.
interface Item {
  /** the field's id */
  id: string;
  label: string;
}

/** Opens the groups round the field `id`, puts it in view and the cursor in it. */
export function goToField(id: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  for (let p: HTMLElement | null = el.parentElement; p; p = p.parentElement) if (p instanceof HTMLDetailsElement) p.open = true;
  el.scrollIntoView({ block: 'center' });
  el.focus({ preventScroll: true });
}

export default function MissingPanel({ title, lead, items, id = 'missing' }: { title: string; lead: string; items: readonly Item[]; id?: string }) {
  return (
    <section className="panel missing" aria-labelledby={`${id}-title`}>
      <SectionTitle id={`${id}-title`} icon="clipboard-pen" tone="warn">{title}</SectionTitle>
      <p className="note">{lead}</p>
      <ul className="missing-list">
        {items.map((i) => (
          <li key={i.id}><a href={`#${i.id}`} onClick={(e) => { e.preventDefault(); goToField(i.id); }}>{i.label}</a></li>
        ))}
      </ul>
    </section>
  );
}
