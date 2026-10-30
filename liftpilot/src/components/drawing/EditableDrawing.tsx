'use client';

// A drawing of the kernel whose dimensions can be changed where they are: the lettering of each editable dimension
// is a button in a layer over the drawing; clicking it (or Enter on it) opens a field on the spot with its length —
// or, for a length a catalogue or a table gives, the list of its entries —, Enter applies it (the owner lays the
// design out again and the drawing follows), Esc or a click elsewhere leaves it. Dimensions whose input was set by
// hand are marked. The drawing itself is the same SVG as everywhere else.
// Motion: none; the buttons only change colour on hover and focus.
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { Edit, Hit, Shape } from '@/drawing';
import { hitBoxes } from './hit-boxes';
import ShapesSvg from './ShapesSvg';

export interface EditTexts {
  /** the name of the layer of buttons */
  group: string;
  /** the name of the input a dimension changes */
  name(edit: Edit): string;
  /** the field's label (a length; an entry of a list), and what changing the dimension changes (from the input's name) */
  newValue: string;
  pick: string;
  moves(name: string): string;
  apply: string;
  cancel: string;
  /** a value refused, with its bounds when known */
  refused(min: number | null, max: number | null): string;
}

/** Why a value was refused: the bounds of the input, when known. */
export type Refusal = { min: number | null; max: number | null };

interface Props {
  shapes: readonly Shape[];
  /** paper box [mm] */
  w: number;
  h: number;
  id: string;
  label: string;
  hits: readonly Hit[];
  /** the input of a dimension is set by hand: it is marked */
  manual(edit: Edit): boolean;
  /** a new length for a dimension (for a choice: the index of the entry): null when applied, else why not */
  onEdit(edit: Edit, length: number): Refusal | null;
  texts: EditTexts;
  /** 'screen': no taller than most of the window (views); 'width': as wide as its place (sheets of paper) */
  fit?: 'screen' | 'width';
  className?: string;
}

// the smallest button on the screen [px]: the lettering of a dimension is a few millimetres of paper
const MIN_PX = 24;

export default function EditableDrawing({ shapes, w, h, id, label, hits, manual, onEdit, texts, fit = 'screen', className }: Props) {
  const uid = useId(), wrap = useRef<HTMLDivElement>(null), pop = useRef<HTMLFormElement>(null);
  const [pxPerMm, setPxPerMm] = useState(3);
  const [open, setOpen] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [choice, setChoice] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const hit = open === null ? null : hits[open] ?? null;

  // the size of a paper millimetre on the screen, for buttons a finger can hit
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = (): void => { if (el.clientWidth > 0) setPxPerMm(el.clientWidth / w); };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [w]);
  // the field in view when it opens
  useEffect(() => { if (open !== null) pop.current?.scrollIntoView({ block: 'nearest' }); }, [open]);
  // a click outside the field leaves it
  useEffect(() => {
    if (open === null) return;
    const away = (e: PointerEvent): void => { if (pop.current && e.target instanceof Node && !pop.current.contains(e.target)) setOpen(null); };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);

  const start = (i: number): void => {
    const v = hits[i]?.value;
    if (v === undefined) return;
    setOpen(i);
    setText(String(Math.round(v)));
    setChoice(Math.max(0, hits[i]?.edit.pick?.current ?? 0));
    setError(null);
  };
  const leave = (): void => {
    const i = open;
    setOpen(null);
    if (i !== null) document.getElementById(`${uid}-${i}`)?.focus();
  };
  const submit = (e: FormEvent): void => {
    e.preventDefault();
    if (!hit) return;
    if (hit.edit.pick) {
      const r = onEdit(hit.edit, choice);
      if (r) setError(texts.refused(r.min, r.max));
      else leave();
      return;
    }
    const v = Number(text.trim().replace(',', '.'));
    if (!text.trim() || !Number.isFinite(v) || v < 0) {
      setError(texts.refused(0, null));
      return;
    }
    const r = onEdit(hit.edit, Math.round(v));
    if (r) setError(texts.refused(r.min, r.max));
    else leave();
  };
  const onKey = (i: number) => (e: KeyboardEvent<SVGRectElement>): void => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      start(i);
    }
  };

  const boxes = hitBoxes(hits, MIN_PX / pxPerMm);
  return (
    <div ref={wrap} className={`ed-wrap${className ? ` ${className}` : ''}`} style={{ aspectRatio: `${w} / ${h}`, maxWidth: fit === 'screen' ? `calc(76vh * ${(w / h).toFixed(4)})` : undefined }}>
      <ShapesSvg shapes={shapes} w={w} h={h} id={id} label={label} />
      <svg className="ed-hits" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet" role="group" aria-label={texts.group}>
        {hits.map((x, i) => {
          const r = boxes[i], bw = r.x1 - r.x0, bh = r.y1 - r.y0, name = `${Math.round(x.value)} mm · ${texts.moves(texts.name(x.edit))}`;
          return (
            <rect key={i} id={`${uid}-${i}`} x={r.x0} y={h - r.y1} width={bw} height={bh} rx={Math.min(bw, bh) / 4}
              className={`hit${manual(x.edit) ? ' manual' : ''}${open === i ? ' on' : ''}`} role="button" tabIndex={0} aria-label={name}
              onClick={() => start(i)} onKeyDown={onKey(i)}>
              <title>{name}</title>
            </rect>
          );
        })}
      </svg>
      {hit ? (
        <form ref={pop} className="ed-pop" onSubmit={submit} onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); leave(); } }}
          style={{
            left: `clamp(8rem, ${(((hit.box.x0 + hit.box.x1) / 2 / w) * 100).toFixed(2)}%, calc(100% - 8rem))`,
            // over the dimension in the drawing's lower half, under it in the upper half: the field stays on the drawing
            ...(hit.box.y0 + hit.box.y1 < h
              ? { top: `${((1 - hit.box.y1 / h) * 100).toFixed(2)}%`, transform: 'translate(-50%, calc(-100% - 6px))' }
              : { top: `${((1 - hit.box.y0 / h) * 100).toFixed(2)}%`, transform: 'translate(-50%, 6px)' }),
          }}>
          {hit.edit.pick ? (
            <label className="ed-field">
              <span>{texts.pick}</span>
              <select className="input" value={choice} autoFocus onChange={(e) => { setChoice(Number(e.target.value)); setError(null); }}
                aria-invalid={error ? true : undefined} aria-describedby={error ? `${uid}-err` : undefined}>
                {hit.edit.pick.options.map((o, k) => <option key={k} value={k}>{o.label}</option>)}
              </select>
            </label>
          ) : (
            <label className="ed-field">
              <span>{texts.newValue}</span>
              <span className="ed-row">
                <input className="input num" type="number" inputMode="numeric" min={0} step={1} value={text} autoFocus
                  onFocus={(e) => e.currentTarget.select()} onChange={(e) => { setText(e.target.value); setError(null); }}
                  aria-invalid={error ? true : undefined} aria-describedby={error ? `${uid}-err` : undefined} />
                <span className="ed-unit">mm</span>
              </span>
            </label>
          )}
          <span className="note">{texts.moves(texts.name(hit.edit))}</span>
          <span className="ed-row">
            <button type="submit" className="btn btn-primary btn-sm">{texts.apply}</button>
            <button type="button" className="btn btn-sm" onClick={leave}>{texts.cancel}</button>
          </span>
          {error ? <span id={`${uid}-err`} className="note bad" role="alert">{error}</span> : null}
        </form>
      ) : null}
    </div>
  );
}
