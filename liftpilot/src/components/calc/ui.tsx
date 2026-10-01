// Small building blocks of the result cards (prototype v12: pill, bar, table, card, key-value list).
import { isValidElement, type ReactNode } from 'react';
import type { CheckStatus } from '@/calc/types';

export function Pill({ status, children }: { status: CheckStatus | 'ko'; children: ReactNode }) {
  return <span className={`pill ${status === 'ko' ? 'fail' : status}`}>{children}</span>;
}

/** Utilisation bar: amber above 0.97, red above 1. */
export function Bar({ u }: { u: number | null | undefined }) {
  if (u == null || !Number.isFinite(u)) return null;
  const cls = u > 1 ? 'fail' : u > 0.97 ? 'warn' : '';
  return (
    <div className="bar" aria-hidden="true">
      <i className={cls} style={{ width: `${Math.min(100, Math.max(2, u * 100)).toFixed(1)}%` }} />
    </div>
  );
}

export function Card({ title, refText, children }: { title: string; refText?: string; children: ReactNode }) {
  return (
    <section className="card">
      <div className="head"><h2>{title}</h2>{refText ? <span className="ref">{refText}</span> : null}</div>
      {children}
    </section>
  );
}

const isPill = (c: ReactNode): boolean => isValidElement(c) && c.type === Pill;

/** Columns after the first are numeric (right-aligned, tabular), except cells holding a status pill. */
export function Table({ head, rows, rowClass }: { head: readonly ReactNode[]; rows: readonly (readonly ReactNode[])[]; rowClass?: (j: number) => string | undefined }) {
  return (
    <div className="tbl">
      <table>
        <thead><tr>{head.map((h, j) => <th key={j} className={j ? 'num' : undefined}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={rowClass?.(i)}>
              {r.map((c, j) => <td key={j} className={j && !isPill(c) ? 'num' : undefined}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function KV({ rows }: { rows: readonly (readonly [string, string])[] }) {
  return (
    <div className="kv">
      {rows.map(([k, v]) => [<div key={`k-${k}`} className="k">{k}</div>, <div key={`v-${k}`} className="v">{v}</div>])}
    </div>
  );
}

export function Note({ children, bad }: { children: ReactNode; bad?: boolean }) {
  return <div className={bad ? 'note bad' : 'note'}>{children}</div>;
}

export function Flag() {
  return <span className="flag">⚠</span>;
}
