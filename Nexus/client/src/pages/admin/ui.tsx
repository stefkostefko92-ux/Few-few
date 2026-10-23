/**
 * Общи UI блокове на админ панела: превод, форматиране, зареждане/грешка/
 * празно, таблица (скрол на десктоп, карти на мобилно), пагинация, търсене,
 * достъпен модал (фокус-капан, Escape, връщане на фокуса) и потвърждение
 * (вкл. „напиши името, за да потвърдиш" за необратимите действия).
 */
import React, { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Trans, useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import './i18n';

/* ===================== Превод и форматиране ===================== */

export function useAdminT() {
  return useTranslation(undefined, { keyPrefix: 'admin' });
}

export function useFmt() {
  const { i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || i18n.language || 'en';
  return useMemo(() => {
    const valid = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
    return {
      num: (v: unknown) => (valid(v) ? v.toLocaleString(lang) : '—'),
      date: (ts: unknown) => (valid(ts) && ts > 0 ? new Date(ts).toLocaleDateString(lang) : '—'),
      dateTime: (ts: unknown) => (valid(ts) && ts > 0 ? new Date(ts).toLocaleString(lang, { dateStyle: 'short', timeStyle: 'short' }) : '—'),
      time: (ts: unknown) => (valid(ts) && ts > 0 ? new Date(ts).toLocaleTimeString(lang) : '—'),
      money: (cents: unknown, currency: unknown) => {
        if (!valid(cents)) return '—';
        try {
          return new Intl.NumberFormat(lang, { style: 'currency', currency: String(currency || 'eur').toUpperCase() }).format(cents / 100);
        } catch {
          return `${(cents / 100).toFixed(2)} ${String(currency || '').toUpperCase()}`;
        }
      },
    };
  }, [lang]);
}

/* ===================== Зареждане на данни ===================== */

export function useLoad<T>(fn: () => Promise<T>, deps: React.DependencyList) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const reload = useCallback(async () => {
    const my = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const d = await fn();
      if (my === seq.current) setData(d);
    } catch (e) {
      if (my === seq.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (my === seq.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { void reload(); }, [reload]);
  return { data, error, loading, reload, setData };
}

/** Стойност с debounce — за полета за търсене. */
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

/* ===================== Структура на страницата ===================== */

export function PageHeader({ title, count, subtitle, children }: { title: string; count?: number | null; subtitle?: React.ReactNode; children?: React.ReactNode }) {
  const fmt = useFmt();
  return (
    <header className="adm-head">
      <div className="adm-head-title">
        <h1>
          {title}
          {typeof count === 'number' && <span className="adm-count">{fmt.num(count)}</span>}
        </h1>
        {subtitle && <p className="adm-sub">{subtitle}</p>}
      </div>
      {children && <div className="adm-head-actions">{children}</div>}
    </header>
  );
}

export function Toolbar({ children }: { children: React.ReactNode }) {
  return <div className="adm-toolbar" role="search">{children}</div>;
}

export function StateView({ loading, error, onRetry, isEmpty, emptyText, children }: {
  loading: boolean; error: string | null; onRetry?: () => void; isEmpty?: boolean; emptyText?: string; children?: React.ReactNode;
}) {
  const { t } = useAdminT();
  if (error) {
    return (
      <div className="adm-state adm-state-error" role="alert">
        <strong>{t('common.loadError')}</strong>
        <span className="muted">{error}</span>
        {onRetry && <button type="button" className="btn btn-sm" onClick={onRetry}>{t('common.retry')}</button>}
      </div>
    );
  }
  if (loading && isEmpty !== false) {
    return (
      <div className="adm-state" aria-busy="true" aria-live="polite">
        <div className="adm-skeleton" /><div className="adm-skeleton" /><div className="adm-skeleton short" />
        <span className="sr-only">{t('common.loading')}</span>
      </div>
    );
  }
  if (isEmpty) return <div className="adm-state adm-state-empty">{emptyText || t('common.empty')}</div>;
  return <>{children}</>;
}

/* ===================== Таблица ===================== */

export interface Col<T> {
  key: string;
  label: string;
  render?: (row: T) => React.ReactNode;
  mono?: boolean;
  /** Показва се като заглавие на картата на мобилно. */
  primary?: boolean;
  align?: 'right';
}

export function DataTable<T>({ cols, rows, rowKey, actions, caption, dim }: {
  cols: Col<T>[]; rows: T[]; rowKey: (r: T, i: number) => React.Key; actions?: (r: T) => React.ReactNode; caption?: string; dim?: boolean;
}) {
  const { t } = useAdminT();
  return (
    <div className={`adm-table-wrap${dim ? ' is-dim' : ''}`}>
      <table className="adm-table">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            {cols.map((c) => <th key={c.key} scope="col" className={c.align === 'right' ? 'num' : undefined}>{c.label}</th>)}
            {actions && <th scope="col"><span className="sr-only">{t('common.actions')}</span></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={rowKey(r, i)}>
              {cols.map((c) => {
                const v = c.render ? c.render(r) : ((r as Record<string, unknown>)[c.key] as React.ReactNode);
                return (
                  <td key={c.key} data-label={c.label} className={[c.mono ? 'mono' : '', c.primary ? 'primary' : '', c.align === 'right' ? 'num' : ''].filter(Boolean).join(' ') || undefined}>
                    {v === null || v === undefined || v === '' ? <span className="muted">—</span> : v}
                  </td>
                );
              })}
              {actions && <td className="adm-row-actions">{actions(r)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pager({ page, pages, total, onPage }: { page: number; pages: number; total: number; onPage: (p: number) => void }) {
  const { t } = useAdminT();
  if (total === 0) return null;
  return (
    <nav className="adm-pager" aria-label={t('common.pageOf', { page, pages, total })}>
      <button type="button" className="btn btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>‹ {t('common.prev')}</button>
      <span className="muted">{t('common.pageOf', { page, pages, total })}</span>
      <button type="button" className="btn btn-sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>{t('common.next')} ›</button>
    </nav>
  );
}

export function SearchBox({ value, onChange, placeholder, label }: { value: string; onChange: (v: string) => void; placeholder?: string; label?: string }) {
  const { t } = useAdminT();
  return (
    <label className="adm-search">
      <span className="sr-only">{label || t('common.search')}</span>
      <input type="search" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} maxLength={80} />
    </label>
  );
}

export function Select({ value, onChange, options, label }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; label: string }) {
  return (
    <label className="adm-select">
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

/* ===================== Полета на форма ===================== */

export function Field({ label, hint, error, children, wide }: { label: string; hint?: React.ReactNode; error?: string | null; children: (id: string) => React.ReactNode; wide?: boolean }) {
  const id = useId();
  return (
    <div className={`adm-field${wide ? ' wide' : ''}${error ? ' has-error' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {children(id)}
      {error ? <span className="adm-field-error" role="alert">{error}</span> : hint ? <span className="adm-field-hint">{hint}</span> : null}
    </div>
  );
}

/** Числово поле, което пази суровия текст докато се пише (без NaN). */
export function NumberInput({ id, value, onChange, min, max, step, placeholder, ariaLabel }: { id?: string; value: number | '' | null | undefined; onChange: (v: number | '') => void; min?: number; max?: number; step?: number; placeholder?: string; ariaLabel?: string }) {
  return (
    <input
      id={id}
      type="number"
      inputMode="numeric"
      value={value === null || value === undefined || (typeof value === 'number' && !Number.isFinite(value)) ? '' : value}
      min={min}
      max={max}
      step={step}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
    />
  );
}

/* ===================== Модал ===================== */

// Стек на отворените модали — Escape/Tab обработва САМО най-горният
// (вложен диалог „Бан" в чекмеджето „Детайли" не затваря и двата).
const modalStack: symbol[] = [];

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({ title, onClose, children, footer, variant = 'dialog', danger, wide }: {
  title: React.ReactNode; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; variant?: 'dialog' | 'drawer'; danger?: boolean;
  /** По-широко чекмедже — за детайли с таблици (герой, гилдия). */
  wide?: boolean;
}) {
  const { t } = useAdminT();
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const me = Symbol('modal');
    modalStack.push(me);
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const first = el?.querySelector<HTMLElement>('[data-autofocus]') || el?.querySelector<HTMLElement>(`.adm-modal-body ${FOCUSABLE}`) || el?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (modalStack[modalStack.length - 1] !== me) return;
      if (e.key === 'Escape') { e.stopPropagation(); closeRef.current(); return; }
      if (e.key !== 'Tab' || !el) return;
      const f = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => n.offsetParent !== null);
      if (!f.length) return;
      const [a, z] = [f[0], f[f.length - 1]];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    document.body.classList.add('adm-modal-open');
    return () => {
      document.removeEventListener('keydown', onKey, true);
      modalStack.splice(modalStack.indexOf(me), 1);
      if (!modalStack.length) document.body.classList.remove('adm-modal-open');
      prev?.focus?.();
    };
  }, []);

  // Портал към body: `position: fixed` не бива да зависи от трансформиран родител.
  return createPortal(
    <div className="adm-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} className={`adm-modal ${variant}${danger ? ' danger' : ''}${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="adm-modal-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="adm-icon-btn" onClick={onClose} aria-label={t('common.close')}>×</button>
        </div>
        <div className="adm-modal-body">{children}</div>
        {footer && <div className="adm-modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/* ===================== Потвърждение ===================== */

export interface ConfirmOpts {
  title: string;
  body?: React.ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  /** Необратимо действие: трябва да се напише тази дума (напр. потребителското име). */
  typeToConfirm?: string;
  /** Искай причина (показва се на засегнатия / пази се в одита). */
  reason?: { min: number; label?: string; placeholder?: string; initial?: string };
}
type ConfirmResult = { reason: string } | null;
type ConfirmFn = (o: ConfirmOpts) => Promise<ConfirmResult>;

const ConfirmCtx = createContext<ConfirmFn>(async () => null);
export const useConfirm = () => useContext(ConfirmCtx);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<(ConfirmOpts & { resolve: (r: ConfirmResult) => void }) | null>(null);
  const confirm = useCallback<ConfirmFn>((o) => new Promise((resolve) => setState({ ...o, resolve })), []);
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {state && (
        <ConfirmDialog
          opts={state}
          onDone={(r) => { state.resolve(r); setState(null); }}
        />
      )}
    </ConfirmCtx.Provider>
  );
}

function ConfirmDialog({ opts, onDone }: { opts: ConfirmOpts; onDone: (r: ConfirmResult) => void }) {
  const { t } = useAdminT();
  const [typed, setTyped] = useState('');
  const [reason, setReason] = useState(opts.reason?.initial || '');
  const typeOk = !opts.typeToConfirm || typed === opts.typeToConfirm;
  const reasonOk = !opts.reason || reason.trim().length >= opts.reason.min;
  const ok = typeOk && reasonOk;
  const submit = (e: React.FormEvent) => { e.preventDefault(); if (ok) onDone({ reason: reason.trim() }); };
  return (
    <Modal
      title={opts.title}
      danger={opts.danger}
      onClose={() => onDone(null)}
      footer={(
        <>
          <button type="button" className="btn" onClick={() => onDone(null)}>{t('common.cancel')}</button>
          <button type="submit" form="adm-confirm-form" className={`btn ${opts.danger ? 'btn-danger' : 'btn-primary'}`} disabled={!ok}>
            {opts.confirmLabel || t('common.yes')}
          </button>
        </>
      )}
    >
      <form id="adm-confirm-form" onSubmit={submit} className="adm-form">
        {opts.body && <div className="adm-confirm-body">{opts.body}</div>}
        {opts.reason && (
          <Field label={opts.reason.label || t('confirm.reasonLabel')} hint={t('confirm.reasonHint', { min: opts.reason.min })} wide>
            {(id) => <textarea id={id} rows={3} maxLength={300} value={reason} placeholder={opts.reason?.placeholder} onChange={(e) => setReason(e.target.value)} data-autofocus />}
          </Field>
        )}
        {opts.typeToConfirm && (
          <Field
            wide
            label={t('confirm.irreversible')}
            hint={<Trans t={t} i18nKey="confirm.typeToConfirm" values={{ word: opts.typeToConfirm }} components={{ 1: <code /> }} />}
          >
            {(id) => (
              <input id={id} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} data-autofocus={opts.reason ? undefined : true} aria-invalid={!!typed && !typeOk} />
            )}
          </Field>
        )}
      </form>
    </Modal>
  );
}

/* ===================== Дребни ===================== */

export function Tag({ tone, children }: { tone?: 'gold' | 'crimson' | 'emerald' | 'sapphire' | 'amethyst'; children: React.ReactNode }) {
  return <span className={`tag${tone ? ` ${tone}` : ''}`}>{children}</span>;
}

/** Грешка от api.ts → текст (сървърът връща вече четим низ). */
export const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/* ===================== Раздели (tabs) ===================== */

/** Достъпни раздели (role=tablist, стрелки ←/→). Панелът се рендерира от викащия. */
export function Tabs<K extends string>({ tabs, value, onChange, label, idPrefix }: {
  tabs: readonly { id: K; label: React.ReactNode }[]; value: K; onChange: (k: K) => void; label: string; idPrefix: string;
}) {
  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = tabs.findIndex((x) => x.id === value);
    const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    onChange(next.id);
    document.getElementById(`${idPrefix}-tab-${next.id}`)?.focus();
  };
  return (
    <div className="adm-tabs" role="tablist" aria-label={label} onKeyDown={onKey}>
      {tabs.map((x) => (
        <button
          key={x.id} type="button" role="tab" id={`${idPrefix}-tab-${x.id}`} aria-selected={value === x.id} aria-controls={`${idPrefix}-panel-${x.id}`}
          tabIndex={value === x.id ? 0 : -1} className={value === x.id ? 'active' : undefined} onClick={() => onChange(x.id)}
        >{x.label}</button>
      ))}
    </div>
  );
}

export function TabPanel({ idPrefix, id, children }: { idPrefix: string; id: string; children: React.ReactNode }) {
  return <div role="tabpanel" id={`${idPrefix}-panel-${id}`} aria-labelledby={`${idPrefix}-tab-${id}`}>{children}</div>;
}

/* ===================== Избор на герой ===================== */

export interface CharOption { id: number; name: string; class: string; level: number; username: string | null }

/** Търсене на герой по име/потребител/id → избран герой. */
export function CharacterPicker({ value, onChange, label, id }: { value: CharOption | null; onChange: (c: CharOption | null) => void; label: string; id?: string }) {
  const { t } = useAdminT();
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 250);
  const [opts, setOpts] = useState<CharOption[]>([]);
  useEffect(() => {
    if (!dq.trim() || value) { setOpts([]); return; }
    let live = true;
    api.get(`/admin/characters?${new URLSearchParams({ q: dq.trim(), pageSize: '8', kind: 'players' })}`)
      .then((r) => { if (live) setOpts(r.characters || []); })
      .catch(() => { if (live) setOpts([]); });
    return () => { live = false; };
  }, [dq, value]);
  if (value) {
    return (
      <div className="adm-picked">
        <span><strong>{value.name}</strong> <span className="muted cap">{value.class} · {t('common.lv')} {value.level}</span>{value.username ? <span className="muted"> · {value.username}</span> : null}</span>
        <button type="button" className="btn btn-sm" onClick={() => { onChange(null); setQ(''); }}>{t('common.change')}</button>
      </div>
    );
  }
  return (
    <div className="adm-picker">
      <input id={id} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('common.findHero')} aria-label={label} maxLength={80} autoComplete="off" />
      {opts.length > 0 && (
        <ul className="adm-picker-list">
          {opts.map((o) => (
            <li key={o.id}>
              <button type="button" onClick={() => onChange(o)}>
                <strong>{o.name}</strong> <span className="muted cap">{o.class} · {t('common.lv')} {o.level}</span>{o.username ? <span className="muted"> · {o.username}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Лента за HP/прогрес (достъпна: role=progressbar). */
export function Meter({ value, max, label, tone }: { value: number; max: number; label: string; tone?: 'crimson' | 'gold' | 'emerald' }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className={`adm-meter${tone ? ` ${tone}` : ''}`} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Редкостите на предметите (филтри, етикети). */
export const RARITY = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const;
