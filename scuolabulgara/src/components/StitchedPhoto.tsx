"use client";

import { useEffect, useRef } from "react";
import { stitchPhoto } from "@/lib/stitch-dom";

type Props = {
  src: string;
  alt: string;
  width: number;
  height: number;
  priority?: boolean;
  className?: string;
};

/**
 * A photograph whose edge comes undone into cross-stitch: the stitches take
 * their thread from the photo itself (each cell's colour, matched to a box of
 * embroidery skeins), dense where they meet the picture and thinning out onto
 * the bare linen. Embroidered once when the page opens; drawn at once when the
 * visitor prefers reduced motion. Without JavaScript the plain photo shows —
 * the fade on its edge only appears once the stitches are there to fill it.
 */
export default function StitchedPhoto({ src, alt, width, height, priority, className }: Props) {
  const fig = useRef<HTMLElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const cvs = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const f = fig.current, im = img.current, c = cvs.current;
    if (!f || !im || !c) return;
    let cancel = () => {}, timer = 0, drawn = false;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const start = () => {
      if (drawn) return;
      drawn = true;
      cancel = stitchPhoto(f, im, c, !reduce.matches);
    };
    if (im.complete && im.naturalWidth) start();
    else im.addEventListener("load", start, { once: true });

    // Same embroidery on resize (the pattern is seeded by position), drawn at once.
    let lastW = f.clientWidth, lastH = f.clientHeight;
    const ro = new ResizeObserver(() => {
      if (!drawn || (f.clientWidth === lastW && f.clientHeight === lastH)) return;
      lastW = f.clientWidth; lastH = f.clientHeight;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => { cancel(); cancel = stitchPhoto(f, im, c, false); }, 160);
    });
    ro.observe(f);
    return () => { cancel(); window.clearTimeout(timer); ro.disconnect(); im.removeEventListener("load", start); };
  }, [src]);

  return (
    <figure ref={fig} className={`stitched ${className ?? ""}`}>
      <img
        ref={img}
        className="stitched__img"
        src={src}
        alt={alt}
        width={width}
        height={height}
        fetchPriority={priority ? "high" : undefined}
        decoding={priority ? "sync" : "async"}
      />
      <canvas ref={cvs} className="stitched__thread" aria-hidden="true" />
    </figure>
  );
}
