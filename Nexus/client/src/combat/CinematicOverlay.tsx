import React, { useEffect, useImperativeHandle, useRef, useState } from 'react';

/**
 * DOM overlay for the cinematic layer:
 *  - Letterbox bars that slide in on intro and on crits (anime "this is the
 *    moment" framing). Stay for ~600ms then slide back out.
 *  - Anime speed lines — radial stripes that pulse outward from a side on
 *    crit. Pure CSS; renders above the WebGL canvas and below the HUD.
 *  - Crit title flash — a one-frame "CRITICAL HIT!" stamp.
 *
 * Parent fires events through a ref so the overlay's lifecycle is fully
 * decoupled from React state changes that drive the combat sim.
 */

export interface CinematicOverlayHandle {
  letterbox: (durationMs?: number) => void;
  speedLines: (side: 'hero' | 'foe', durationMs?: number) => void;
  critStamp: (text?: string) => void;
}

const CinematicOverlay = React.forwardRef<CinematicOverlayHandle>((_, ref) => {
  const [letterOn, setLetterOn] = useState(false);
  const [linesSide, setLinesSide] = useState<'hero' | 'foe' | null>(null);
  const [stamp, setStamp] = useState<string | null>(null);
  const tLetter = useRef<number | null>(null);
  const tLines = useRef<number | null>(null);
  const tStamp = useRef<number | null>(null);

  useImperativeHandle(ref, () => ({
    letterbox(durationMs = 700) {
      setLetterOn(true);
      if (tLetter.current) window.clearTimeout(tLetter.current);
      tLetter.current = window.setTimeout(() => setLetterOn(false), durationMs);
    },
    speedLines(side, durationMs = 600) {
      setLinesSide(side);
      if (tLines.current) window.clearTimeout(tLines.current);
      tLines.current = window.setTimeout(() => setLinesSide(null), durationMs);
    },
    critStamp(text = 'CRITICAL HIT!') {
      setStamp(text);
      if (tStamp.current) window.clearTimeout(tStamp.current);
      tStamp.current = window.setTimeout(() => setStamp(null), 1100);
    },
  }));

  // Initial letterbox flash on mount — establishes the cinematic frame.
  useEffect(() => {
    setLetterOn(true);
    const t = window.setTimeout(() => setLetterOn(false), 1500);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div className="cinematic-overlay" aria-hidden>
      <div className={`letterbox top ${letterOn ? 'on' : ''}`} />
      <div className={`letterbox bottom ${letterOn ? 'on' : ''}`} />
      {linesSide && <div className={`speed-lines from-${linesSide}`} />}
      {stamp && <div className="crit-stamp">{stamp}</div>}
    </div>
  );
});

export default CinematicOverlay;
