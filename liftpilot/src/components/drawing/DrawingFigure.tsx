'use client';

// A drawing on the page that opens on the whole screen: the button beside its caption puts the figure on the screen —
// the browser's full screen, or where there is none (an iPhone, some embedded frames) a layer over the window —, the
// drawing fitted to it. There it zooms (− and +, the keys + − 0, Ctrl with the wheel, two fingers) and moves (a drag,
// the wheel, the arrows on the drawing); the dimensions that change on the drawing still change there. Esc or the
// button closes it and the page is as it was. On the page nothing else changes: no zoom, no drag.
// Motion: none (each zoom is a step, no animation).
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ZOOM_MAX, ZOOM_MIN, ZOOM_STEP, useZoomPan } from './use-zoom-pan';

type Full = 'off' | 'native' | 'window';

interface Props {
  /** the figure's own class (sheet-view, sheet-page…) */
  className?: string;
  /** the paper box of the drawing [mm]: its proportions fit the screen */
  w: number;
  h: number;
  /** what the drawing is: the button's and the full screen's name */
  label: string;
  caption?: ReactNode;
  children: ReactNode;
}

const typing = (t: EventTarget | null): boolean => t instanceof Element && !!t.closest('input, select, textarea');

function Corners({ out }: { out: boolean }) {
  // four corners pointing out (open) or in (close), drawn in the button's colour
  const d = out ? 'M3 8V3h5M16 3h5v5M21 16v5h-5M8 21H3v-5' : 'M8 3v5H3M21 8h-5V3M16 21v-5h5M3 16h5v5';
  return <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><path d={d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export default function DrawingFigure({ className, w, h, label, caption, children }: Props) {
  const t = useTranslations('drawing');
  const fig = useRef<HTMLElement>(null), toggleBtn = useRef<HTMLButtonElement>(null);
  const [full, setFull] = useState<Full>('off');
  const on = full !== 'off';
  const { viewport, stage, zoom, zoomBy, fit, handlers } = useZoomPan(on);

  // the browser leaves its full screen (Esc, a gesture): the drawing goes back into the page
  useEffect(() => {
    const sync = (): void => setFull((f) => (document.fullscreenElement === fig.current ? 'native' : f === 'native' ? 'off' : f));
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);
  // over the window: the page under it does not scroll, Esc closes it
  useEffect(() => {
    if (full !== 'window') return;
    const onKey = (e: globalThis.KeyboardEvent): void => { if (e.key === 'Escape' && !typing(e.target)) setFull('off'); };
    document.documentElement.classList.add('draw-full-open');
    document.addEventListener('keydown', onKey);
    return () => {
      document.documentElement.classList.remove('draw-full-open');
      document.removeEventListener('keydown', onKey);
    };
  }, [full]);
  // the keys work on the drawing at once; back on the page, the button has the focus again
  const was = useRef(false);
  useEffect(() => {
    if (on) viewport.current?.focus({ preventScroll: true });
    else if (was.current) toggleBtn.current?.focus({ preventScroll: true });
    was.current = on;
  }, [on, viewport]);

  const toggle = (): void => {
    const el = fig.current;
    if (!el) return;
    if (full === 'native') void document.exitFullscreen().catch(() => setFull('off'));
    else if (full === 'window') setFull('off');
    else {
      fit();
      // not on an iPhone nor in every embedded frame: there the window
      if (document.fullscreenEnabled && typeof el.requestFullscreen === 'function') el.requestFullscreen({ navigationUI: 'hide' }).then(() => setFull('native'), () => setFull('window'));
      else setFull('window');
    }
  };
  const onKey = (e: KeyboardEvent<HTMLElement>): void => {
    if (!on || typing(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    // the browser's own full screen closes on Esc by itself; where it hands the key to the page, the same
    if (e.key === 'Escape' && full === 'native') void document.exitFullscreen().catch(() => setFull('off'));
    else if (e.key === '+' || e.key === '=') zoomBy(ZOOM_STEP);
    else if (e.key === '-' || e.key === '_') zoomBy(1 / ZOOM_STEP);
    else if (e.key === '0') fit();
    else return;
    e.preventDefault();
  };

  const style = { '--ratio': (w / h).toFixed(5), '--zoom': zoom.toFixed(4) } as CSSProperties;
  const pct = Math.round(zoom * 100);
  return (
    <figure ref={fig} className={`draw-frame${className ? ` ${className}` : ''}${on ? ' full' : ''}`} style={style} onKeyDown={onKey}
      aria-label={on ? t('fullOf', { name: label }) : undefined}>
      {on ? (
        <div className="draw-bar">
          <span className="draw-title">{label}</span>
          <span className="draw-tools">
            <button type="button" className="btn btn-sm" onClick={() => zoomBy(1 / ZOOM_STEP)} disabled={zoom <= ZOOM_MIN + 1e-6} aria-label={t('zoomOut')} title={t('zoomOut')}>−</button>
            <output className="draw-zoom num" aria-live="polite" aria-label={t('zoom', { n: pct })}>{pct} %</output>
            <button type="button" className="btn btn-sm" onClick={() => zoomBy(ZOOM_STEP)} disabled={zoom >= ZOOM_MAX - 1e-6} aria-label={t('zoomIn')} title={t('zoomIn')}>+</button>
            <button type="button" className="btn btn-sm" onClick={fit} disabled={zoom <= ZOOM_MIN + 1e-6}>{t('fit')}</button>
            <button ref={toggleBtn} type="button" className="btn btn-sm btn-primary" onClick={toggle} aria-pressed="true" aria-label={t('exit')} title={t('exit')}>
              <Corners out={false} /><span>{t('exit')}</span>
            </button>
          </span>
        </div>
      ) : null}
      <div ref={viewport} className="draw-viewport" tabIndex={on ? 0 : undefined} aria-label={on ? t('viewport') : undefined} {...handlers}>
        <div ref={stage} className="draw-stage">{children}</div>
      </div>
      {on ? <p className="draw-hint">{t('hint')}</p> : (
        <div className="draw-foot">
          <button ref={toggleBtn} type="button" className="btn btn-sm draw-open" onClick={toggle} aria-pressed="false" aria-label={t('fullOf', { name: label })} title={t('full')}>
            <Corners out /><span>{t('full')}</span>
          </button>
          {caption ? <figcaption>{caption}</figcaption> : null}
        </div>
      )}
    </figure>
  );
}
