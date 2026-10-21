// The survey sheets' small pieces shared by the list, the sheet and its print (rilievi's partials and _hl/_table.ejs):
// the query's words marked in a text, the measurements per stop as a table, the lift's plate, the pager. No state, no
// hooks: they render on the server.
import type { DisplaySection } from '@/lib/rilievi/format';
import type { TableView } from '@/lib/rilievi/misure';
import { highlight } from '@/lib/rilievi/search';
import type { RilieviT } from '@/lib/rilievi/t';
import { Link } from '@/i18n/routing';

/** A value with the searched words in <mark>; nothing → a muted dash (rilievi _hl.ejs). */
export function Hl({ text, tokens }: { text: string | null; tokens: readonly string[] }) {
  if (!text) return <span className="rv-muted">—</span>;
  // one box around the pieces: a table cell laid out as a grid on a phone keeps the text whole
  return <span>{highlight(text, tokens).map((s, i) => (s.hit ? <mark key={i}>{s.text}</mark> : <span key={i}>{s.text}</span>))}</span>;
}

/** The measurements per stop (misure.ts misureTable): `rv-mtable` on the sheet, `rv-ptable` on paper. Each cell carries
 *  its column's name (data-label): on a phone a row becomes a card. */
export function MisureTable({ table, className = 'rv-mtable' }: { table: TableView; className?: string }) {
  return (
    <table className={className}>
      <thead><tr>{table.head.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
      <tbody>
        {table.rows.map((row) => (
          <tr key={row[0]}>
            {row.map((cell, i) => (i === 0
              ? <th key={i} scope="row" data-label={table.head[0]}>{cell}</th>
              : cell ? <td key={i} data-label={table.head[i]}>{cell}</td> : <td key={i} className="empty" data-label={table.head[i]}>—</td>))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The plate's four specs, in rilievi's order: load, persons, stops, make. */
const PLATE_SPECS = ['portataKg', 'capienzaPersone', 'fermate', 'marca'] as const;

/** The lift's plate (rilievi partials/plate.ejs, commit 988f3cf37): the matricola on the left and the number on the right,
 *  big, the address, then the specs. On the print the address is in the head (`withAddress` false). */
export function Plate({ scheda, sections, t, withAddress = true }: {
  scheda: { numeroImpianto: string | null; matricola: string | null; indirizzo: string | null };
  sections: readonly DisplaySection[];
  t: RilieviT;
  withAddress?: boolean;
}) {
  const byKey = new Map(sections.flatMap((s) => s.fields).map((f) => [f.key, f]));
  const id = (label: string, value: string | null, end = false) => (
    <div className={end ? 'end' : undefined}>
      <span className="rv-plate-label">{label}</span>
      <span className={value ? 'rv-plate-big' : 'rv-plate-big none'}>{value || '—'}</span>
    </div>
  );
  return (
    <section className="rv-plate" aria-label={t('scheda.plateLabel')}>
      {(['tl', 'tr', 'bl', 'br'] as const).map((c) => <span key={c} className={`rv-screw ${c}`} aria-hidden="true" />)}
      <div className="rv-plate-ids">
        {id(t('scheda.field.matricola'), scheda.matricola)}
        {id(t('scheda.field.numeroImpianto'), scheda.numeroImpianto, true)}
      </div>
      {withAddress ? <p className="rv-plate-address">{scheda.indirizzo || t('scheda.noAddress')}</p> : null}
      <dl className="rv-plate-specs">
        {PLATE_SPECS.map((key) => {
          const f = byKey.get(key);
          return <div key={key}><dt className="rv-plate-label">{f?.label ?? key}</dt><dd>{f?.value || '—'}</dd></div>;
        })}
      </dl>
    </section>
  );
}

/** «Precedente / Pagina 2 di 5 / Successiva», the query kept (rilievi partials/pager.ejs). */
export function Pager({ base, q, page, pages, t }: { base: string; q: string; page: number; pages: number; t: RilieviT }) {
  if (pages <= 1) return null;
  const href = (p: number) => ({ pathname: base, query: q ? { q, p: String(p) } : { p: String(p) } });
  return (
    <nav className="rv-pager" aria-label={t('pager.label')}>
      {page > 1 ? <Link className="btn btn-sm" href={href(page - 1)} rel="prev">{t('pager.prev')}</Link> : <span />}
      <span>{t('pager.status', { page, pages })}</span>
      {page < pages ? <Link className="btn btn-sm" href={href(page + 1)} rel="next">{t('pager.next')}</Link> : <span />}
    </nav>
  );
}
