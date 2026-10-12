'use client';

// A record's result pill that does not pass, or passes with warnings, as a button: it opens a panel with every check
// behind the count — the ones not passed, then those with a warning —, each with its value against its limit, and the
// way to the record's checks. Read from the server on the first opening (the dashboard lists up to 500 records: nothing
// is read before), kept for the page's life. A click or a tap opens and closes it; with a mouse, resting on the pill or
// focusing it from the keyboard opens it too, and it stays while the pointer is over the pill or the panel. Esc closes it
// and gives the focus back to the pill, a click outside closes it, one panel at a time. The panel lives in the top layer
// (popover), so no frame of the page clips it; below the pill, above it near the bottom edge, the window's width less
// 16 px each side on a phone.
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type FocusEvent, type PointerEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import type { VerdictDetail, VerdictKind, VerdictRow } from '@/lib/verdict-checks';

/** Where a record's checks are: its page, at the section that lists them. */
const PAGE: Readonly<Record<VerdictKind, { path: string; anchor: string }>> = {
  calc: { path: '/app/calculations', anchor: 'checks' },
  shaft: { path: '/app/shaft-designs', anchor: 'checks' },
  room: { path: '/app/room-designs', anchor: 'room-checks' },
  lift: { path: '/app/lift-designs', anchor: 'checks' },
};

const DELAY = 150, GAP = 8, EDGE = 16, WIDTH = 400, MAX_H = 440, NARROW = 600;

// one read per record and language for the page's life (a failed one is read again on the next opening)
const reads = new Map<string, Promise<VerdictDetail>>();
function read(kind: VerdictKind, id: string, locale: string): Promise<VerdictDetail> {
  const key = `${kind}/${id}/${locale}`;
  let p = reads.get(key);
  if (!p) {
    p = fetch(`/api/verdict-checks/${kind}/${id}?locale=${encodeURIComponent(locale)}`, { headers: { accept: 'application/json' }, credentials: 'same-origin' })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d = (await r.json()) as VerdictDetail;
        if (!Array.isArray(d.fails) || !Array.isArray(d.warns)) throw new Error('bad answer');
        return d;
      });
    reads.set(key, p);
    p.catch(() => reads.delete(key));
  }
  return p;
}

// the panel open on the page, closed when another opens
let openNow: (() => void) | null = null;

type Mode = 'hover' | 'focus' | 'pinned';
type Load = { s: 'idle' } | { s: 'loading' } | { s: 'error' } | { s: 'ok'; d: VerdictDetail };

const canHover = (): boolean => globalThis.matchMedia?.('(hover: hover) and (pointer: fine)').matches ?? false;

export default function VerdictChecks({ kind, id, verdict, label }: { kind: VerdictKind; id: string; verdict: 'FAIL' | 'WARN'; label: string }) {
  const t = useTranslations('verdictChecks'), locale = useLocale();
  const uid = useId(), panelId = `vc${uid}`, titleId = `${panelId}t`;
  const [mode, setMode] = useState<Mode | null>(null);
  const [load, setLoad] = useState<Load>({ s: 'idle' });
  const wrap = useRef<HTMLSpanElement>(null), btn = useRef<HTMLButtonElement>(null), panel = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // the focus given back to the pill by Esc does not open it again
  const quiet = useRef(false);
  const cls = verdict === 'FAIL' ? 'fail' : 'warn';

  const later = useCallback((f: (() => void) | null) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = f ? setTimeout(f, DELAY) : null;
  }, []);
  const close = useCallback(() => { later(null); setMode(null); }, [later]);
  const fetchIt = useCallback(() => {
    setLoad({ s: 'loading' });
    read(kind, id, locale).then((d) => setLoad({ s: 'ok', d }), () => setLoad({ s: 'error' }));
  }, [kind, id, locale]);
  // the read starts with the first opening (and again after a failure)
  const open = useCallback((m: Mode) => {
    later(null);
    if (openNow && openNow !== close) openNow();
    openNow = close;
    setMode(m);
    if (load.s === 'idle' || load.s === 'error') fetchIt();
  }, [close, later, load.s, fetchIt]);
  useEffect(() => () => { later(null); if (openNow === close) openNow = null; }, [close, later]);

  // placed by the pill: below it, above it when below has no room, inside the window; re-placed while the page scrolls
  const place = useCallback(() => {
    const b = btn.current, p = panel.current;
    if (!b || !p) return;
    const r = b.getBoundingClientRect(), vw = document.documentElement.clientWidth, vh = globalThis.innerHeight;
    const narrow = vw < NARROW, width = narrow ? vw - 2 * EDGE : Math.min(WIDTH, vw - 2 * EDGE);
    p.style.width = `${width}px`;
    // its whole height, the list unscrolled (measured without touching it: the list keeps where it was scrolled to)
    const body = p.querySelector<HTMLElement>('.vc-body');
    const natural = p.offsetHeight + (body ? body.scrollHeight - body.clientHeight : 0), below = vh - r.bottom - GAP - EDGE, above = r.top - GAP - EDGE;
    const down = below >= Math.min(natural, 240) || below >= above, room = Math.max(160, Math.min(MAX_H, down ? below : above));
    p.style.maxHeight = `${room}px`;
    const h = Math.min(natural, room);
    p.style.top = `${Math.round(down ? r.bottom + GAP : r.top - GAP - h)}px`;
    p.style.left = `${Math.round(narrow ? EDGE : Math.min(Math.max(EDGE, r.left), vw - EDGE - width))}px`;
    p.dataset.side = down ? 'below' : 'above';
  }, []);
  useLayoutEffect(() => {
    const p = panel.current;
    if (!mode || !p) return;
    if (typeof p.showPopover === 'function' && !p.matches(':popover-open')) p.showPopover();
    place();
  }, [mode, load, place]);
  useEffect(() => {
    if (!mode) return;
    let frame = 0;
    // the page scrolled (not the panel's own list) or the window changed: placed again by the pill
    const again = (e: Event) => {
      if (e.target instanceof Node && panel.current?.contains(e.target)) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const inside = !!wrap.current?.contains(document.activeElement);
      close();
      if (inside && document.activeElement !== btn.current) { quiet.current = true; btn.current?.focus(); }
    };
    const down = (e: globalThis.PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) close(); };
    globalThis.addEventListener('scroll', again, { capture: true, passive: true });
    globalThis.addEventListener('resize', again);
    document.addEventListener('keydown', key);
    document.addEventListener('pointerdown', down, true);
    return () => {
      cancelAnimationFrame(frame);
      globalThis.removeEventListener('scroll', again, { capture: true });
      globalThis.removeEventListener('resize', again);
      document.removeEventListener('keydown', key);
      document.removeEventListener('pointerdown', down, true);
    };
  }, [mode, close, place]);

  const enter = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' || !canHover()) return;
    if (mode) later(null);
    else later(() => open('hover'));
  };
  const leave = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    if (mode === 'hover') later(close);
    else if (!mode) later(null);
  };
  const focus = () => {
    if (quiet.current) { quiet.current = false; return; }
    if (!mode && canHover() && btn.current?.matches(':focus-visible')) later(() => open('focus'));
  };
  const blur = (e: FocusEvent) => {
    if (wrap.current?.contains(e.relatedTarget as Node | null)) return;
    quiet.current = false;
    if (mode === 'focus') close();
    else if (!mode) later(null);
  };

  const list = (rows: readonly VerdictRow[], head: string, tone: 'fail' | 'warn') => rows.length ? (
    <div className={`vc-group ${tone}`}>
      <p id={`${panelId}${tone}`} className="vc-group-head">{head}</p>
      <ul className="vc-list" aria-labelledby={`${panelId}${tone}`}>
        {rows.map((r, i) => (
          <li key={`${i}${r.name}`} className="vc-item">
            <span className="vc-name">{r.name}</span>
            <span className="vc-fig">
              <span className="vc-value">{r.value}</span>
              {r.limit ? <span className="vc-limit">{t('limit')} {r.limit}</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  ) : null;

  const title = t(verdict === 'FAIL' ? 'titleFail' : 'titleWarn');
  const { path, anchor } = PAGE[kind];
  return (
    <span ref={wrap} className="vc" onPointerEnter={enter} onPointerLeave={leave} onBlur={blur}>
      <button ref={btn} type="button" className={`status-pill ${cls} vc-pill`} aria-expanded={mode !== null} aria-controls={mode ? panelId : undefined}
        aria-label={`${label}, ${t(verdict === 'FAIL' ? 'showFail' : 'showWarn')}`} onFocus={focus}
        onClick={() => (mode === 'pinned' ? close() : open('pinned'))}>
        {label}<span className="vc-caret" aria-hidden="true" />
      </button>
      {mode ? (
        <div ref={panel} id={panelId} className={`vc-panel ${cls}`} role="dialog" aria-labelledby={titleId} popover="manual">
          <div className="vc-head">
            <p id={titleId} className="vc-title">{title}</p>
            <button type="button" className="vc-close" aria-label={t('close')} onClick={() => { close(); quiet.current = true; btn.current?.focus(); }}>
              <span aria-hidden="true">×</span>
            </button>
          </div>
          <div className="vc-body">
            {load.s === 'ok' ? (
              <>
                {list(load.d.fails, t('fails', { n: load.d.fails.length }), 'fail')}
                {list(load.d.warns, t('warns', { n: load.d.warns.length }), 'warn')}
                {!load.d.fails.length && !load.d.warns.length ? <p className="vc-empty">{t('none')}</p> : null}
                {load.d.note ? <p className="vc-note" role="note">{load.d.note}</p> : null}
              </>
            ) : load.s === 'error' ? (
              <p className="vc-state" role="alert">{t('error')} <button type="button" className="vc-retry" onClick={fetchIt}>{t('retry')}</button></p>
            ) : <p className="vc-state" role="status">{t('loading')}</p>}
          </div>
          <div className="vc-foot">
            <Link href={`${path}/${id}#${anchor}`} className="vc-open" onClick={close}>{t('open')}</Link>
          </div>
        </div>
      ) : null}
    </span>
  );
}
