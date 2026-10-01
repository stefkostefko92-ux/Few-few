// Technical tables as cards (prototype v12, renderResults); the rows come from lib/present/tables, which the
// calculation report uses too.
import type { ReactNode } from 'react';
import type { Analysis } from '@/lib/present/analysis';
import { techTables, type Cell } from '@/lib/present/tables';
import type { Texts } from '@/lib/present/texts';
import type { Pres } from '@/lib/present/tr';
import { Bar, Card, Flag, Note, Pill, Table } from './ui';

function cell(c: Cell): ReactNode {
  if (typeof c === 'string') return c;
  if (c.status) return <Pill status={c.status}>{c.text}</Pill>;
  return (
    <>
      {c.text}{c.flag ? <> <Flag /></> : null}
      {c.sub ? <div className="sub">{c.sub}</div> : null}
      {c.bar != null ? <Bar u={c.bar} /> : null}
    </>
  );
}

export function techCards(P: Pres, X: Texts, a: Analysis): ReactNode[] {
  return techTables(P, X, a).map((b) => (
    <Card key={b.key} title={b.title} refText={b.ref}>
      {b.rows.length ? <Table head={b.head} rows={b.rows.map((r) => r.map(cell))} /> : null}
      {b.list?.length ? <ul className="plain">{b.list.map((x) => <li key={x.text}>{x.flag ? <><Flag /> </> : null}{x.text}</li>)}</ul> : null}
      {b.notes.map((n) => <Note key={n.text}>{n.flag ? <><Flag /> </> : null}{n.text}</Note>)}
    </Card>
  ));
}
