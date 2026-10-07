"use client";

import { useEffect, useRef, useState } from "react";
import type { Letter } from "@/lib/content";
import { sewLetter } from "@/lib/stitch-dom";

type Labels = { pick: string; latin: string; meaning: string; listen: string };

/**
 * The 30 letters as a keyboard-friendly grid; the chosen one is shown large
 * and embroidered — its capital rasterised from the page font (Bulgarian
 * letterforms) onto an Aida grid and sewn stitch by stitch. Without JavaScript
 * the grid and the first letter still read correctly.
 */
export default function Alphabet({ letters, labels }: { letters: Letter[]; labels: Labels }) {
  const [sel, setSel] = useState(0);
  const cvs = useRef<HTMLCanvasElement>(null);
  const glyph = useRef<HTMLSpanElement>(null);
  const cur = letters[sel] ?? letters[0];

  useEffect(() => {
    const c = cvs.current, g = glyph.current;
    if (!c || !g || !cur) return;
    let cancel = () => {}, live = true;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.fonts.ready.then(() => { if (live) cancel = sewLetter(c, getComputedStyle(g).fontFamily, cur.letter, !reduce); });
    return () => { live = false; cancel(); };
  }, [cur]);

  // The word, spoken: one player for the whole grid; a new letter stops the old clip.
  const player = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => () => { player.current?.pause(); }, []);
  useEffect(() => { player.current?.pause(); setPlaying(false); }, [cur]);
  const speak = () => {
    if (!cur?.audio) return;
    player.current?.pause();
    const a = new Audio(cur.audio);
    player.current = a;
    a.onended = a.onerror = () => setPlaying(false);
    setPlaying(true);
    a.play().catch(() => setPlaying(false));
  };

  // Arrow keys move through the grid like a keyboard (roving focus).
  const grid = useRef<HTMLDivElement>(null);
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const cols = Number(getComputedStyle(grid.current!).getPropertyValue("--cols")) || 6;
    const d = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols, Home: -i, End: letters.length - 1 - i }[e.key];
    if (d === undefined) return;
    e.preventDefault();
    const next = Math.min(letters.length - 1, Math.max(0, i + d));
    setSel(next);
    grid.current?.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
  };

  if (!cur) return null;
  return (
    <div className="abc">
      <div className="abc__grid" ref={grid} role="group" aria-label={labels.pick}>
        {letters.map((l, i) => (
          <button
            key={`${l.letter}-${i}`}
            type="button"
            lang="bg"
            className="abc__key"
            aria-pressed={i === sel}
            tabIndex={i === sel ? 0 : -1}
            onClick={() => setSel(i)}
            onKeyDown={(e) => onKey(e, i)}
          >
            {l.letter}
            <small>{l.latin}</small>
          </button>
        ))}
      </div>

      <div className="abc__card">
        <div className="abc__cloth">
          <canvas ref={cvs} aria-hidden="true" />
          <span className="abc__glyph" ref={glyph} lang="bg" aria-hidden="true">{cur.letter}</span>
        </div>
        <div className="abc__info" aria-live="polite">
          <p className="abc__pair" lang="bg">{cur.letter}{cur.letter.toLocaleLowerCase("bg")}</p>
          <p className="abc__word" lang="bg">
            {cur.word}
            {cur.audio && (
              <button type="button" className={`abc__speak ${playing ? "is-playing" : ""}`} onClick={speak} aria-label={`${labels.listen}: ${cur.word}`} title={labels.listen}>
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 9v6h4l5 4V5L8 9H4Z" fill="currentColor" stroke="none" />
                  <path d="M16.5 8.5a5 5 0 0 1 0 7" /><path d="M19 6a8.5 8.5 0 0 1 0 12" />
                </svg>
              </button>
            )}
          </p>
          <dl>
            <div><dt>{labels.latin}</dt><dd>{cur.latin}</dd></div>
            <div><dt>{labels.meaning}</dt><dd>{cur.meaning}</dd></div>
          </dl>
        </div>
      </div>
    </div>
  );
}
