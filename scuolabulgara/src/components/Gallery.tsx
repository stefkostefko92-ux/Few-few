"use client";

import { useEffect, useRef, useState } from "react";
import type { GalleryPhoto } from "@/lib/content";

type Pic = { src: string; srcSet?: string; sizes?: string; width: number; height: number };
type Photo = GalleryPhoto & { thumb?: Pic; full?: Pic };

// Masonry of real photos at their natural proportions (no forced square crops),
// with a lightbox on the native <dialog>: it traps focus, closes on Esc and
// returns focus to the thumbnail by itself — no focus-trap library needed.
export default function Gallery({ photos, labels }: {
  photos: Photo[];
  labels: { close: string; prev: string; next: string; open: string };
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState(0);
  // The full-size photo is mounted only while the lightbox is open: an <img>
  // inside a closed <dialog> is still downloaded, which cost every visitor a
  // full-resolution photo they might never open.
  const [isOpen, setIsOpen] = useState(false);
  const count = photos.length;

  const open = (i: number) => {
    setIndex(i);
    setIsOpen(true);
    dialog.current?.showModal();
  };
  const step = (d: number) => setIndex((i) => (i + d + count) % count);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    const onClose = () => setIsOpen(false);
    el.addEventListener("keydown", onKey);
    el.addEventListener("close", onClose);
    return () => { el.removeEventListener("keydown", onKey); el.removeEventListener("close", onClose); };
    // step only depends on `count`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);

  if (count === 0) return null;
  const cur = photos[index];

  return (
    <>
      <div className="masonry">
        {photos.map((p, i) => (
          <figure className="masonry__item" key={`${p.src}-${i}`}>
            <button type="button" className="masonry__btn" onClick={() => open(i)} aria-label={`${labels.open}: ${p.caption || p.alt}`}>
              <img {...(p.thumb ?? { src: p.src })} alt={p.alt} loading="lazy" decoding="async" />
            </button>
            {p.caption && <figcaption>{p.caption}</figcaption>}
          </figure>
        ))}
      </div>

      <dialog
        ref={dialog}
        className="lightbox"
        aria-label={cur?.caption || cur?.alt}
        // A click on the backdrop (the dialog box itself, outside the content) closes it.
        onClick={(e) => { if (e.target === e.currentTarget) dialog.current?.close(); }}
      >
        {isOpen && cur && (
          <div className="lightbox__inner">
            <img {...(cur.full ?? { src: cur.src })} alt={cur.alt} />
            <div className="lightbox__bar">
              <span className="lightbox__caption">{cur.caption}</span>
              <span className="lightbox__count">{index + 1} / {count}</span>
            </div>
            {count > 1 && (
              <>
                <button type="button" className="lightbox__nav lightbox__nav--prev" onClick={() => step(-1)} aria-label={labels.prev}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
                <button type="button" className="lightbox__nav lightbox__nav--next" onClick={() => step(1)} aria-label={labels.next}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
              </>
            )}
            <button type="button" className="lightbox__close" onClick={() => dialog.current?.close()} aria-label={labels.close}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" /></svg>
            </button>
          </div>
        )}
      </dialog>
    </>
  );
}
