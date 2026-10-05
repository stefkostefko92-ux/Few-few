'use client';

// What a form still needs before the software works anything out: each value, a link that opens its group and puts
// the cursor in its field.
interface Item {
  /** the field's id */
  id: string;
  label: string;
}

function goTo(id: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  for (let p: HTMLElement | null = el.parentElement; p; p = p.parentElement) if (p instanceof HTMLDetailsElement) p.open = true;
  el.scrollIntoView({ block: 'center' });
  el.focus({ preventScroll: true });
}

export default function MissingPanel({ title, lead, items, id = 'missing' }: { title: string; lead: string; items: readonly Item[]; id?: string }) {
  return (
    <section className="panel missing" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>{title}</h2>
      <p className="note">{lead}</p>
      <ul className="missing-list">
        {items.map((i) => (
          <li key={i.id}><a href={`#${i.id}`} onClick={(e) => { e.preventDefault(); goTo(i.id); }}>{i.label}</a></li>
        ))}
      </ul>
    </section>
  );
}
