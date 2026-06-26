import React, { useEffect, useRef, useState } from 'react';

/**
 * Cinematic intro: the first-impression hook before the marketing page.
 *
 * Plays a 4-line narration via the Web Speech API (no audio assets — voice
 * is synthesised in-browser, free, works offline). The text is also written
 * out letter-by-letter for hearing-impaired visitors, and as a fallback
 * when speechSynthesis is unavailable (Safari iOS without user gesture).
 *
 * Auto-dismisses after the last line. User can skip with Esc/click.
 *
 * Suppression: once played in a session we set `sessionStorage.nd_intro_seen`
 * so the user isn't ambushed every time they navigate home in the same tab.
 */

// Audit: original lines were AI-fantasy-trope ("a thousand thrones held
// the sky", "something older than gods listens"). Rewritten with the
// restraint of an actual cold open: concrete, grounded, no em-dashes,
// the world implied rather than declared.
const LINES: { text: string; ms: number }[] = [
  { text: 'The road north is open again.', ms: 3400 },
  { text: 'Six kingdoms paid for it. None will say with what.', ms: 4600 },
  { text: 'You start at Aedric, with a sword borrowed from the watch and a name nobody knows yet.', ms: 6800 },
  { text: 'There is a tower at the end of the road. Climb it, and the realm learns your name.', ms: 6000 },
  { text: 'Welcome to Nexus.', ms: 3000 },
];

interface Props { onDone: () => void }

export default function CinematicIntro({ onDone }: Props): React.ReactElement {
  const [idx, setIdx] = useState(0);
  const [closing, setClosing] = useState(false);
  const timerRef = useRef<number | null>(null);
  const utteredRef = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const skipBtnRef = useRef<HTMLButtonElement>(null);

  // Audit (animation HIGH #7): the dialog wrapper was non-focusable
  // and the skip button never received focus, so keyboard / screen-
  // reader users had no path to dismiss this full-screen overlay.
  // Focus the skip button on mount, then trap focus inside the
  // overlay until it closes.
  useEffect(() => {
    const root = rootRef.current;
    skipBtnRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Tab' || !root) return;
      const focusables = root.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])');
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
      else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Wire up speech synthesis once, then walk the line list.
  useEffect(() => {
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
    const supportsSpeech = !!synth;

    function speak(text: string) {
      if (!supportsSpeech || utteredRef.current) return;
      try {
        const u = new SpeechSynthesisUtterance(text);
        // Pick the deepest available voice — usually male English.
        const voices = synth!.getVoices();
        const pick =
          voices.find((v) => /en-?(GB|US)/.test(v.lang) && /male|daniel|alex|fred|david|google uk english male/i.test(v.name)) ||
          voices.find((v) => /en-?(GB|US)/.test(v.lang)) ||
          voices[0];
        if (pick) u.voice = pick;
        u.rate = 0.86;
        u.pitch = 0.65;
        u.volume = 0.9;
        synth!.speak(u);
      } catch { /* ignore */ }
    }

    function walk(i: number) {
      if (i >= LINES.length) {
        timerRef.current = window.setTimeout(() => finish(), 800);
        return;
      }
      setIdx(i);
      speak(LINES[i].text);
      timerRef.current = window.setTimeout(() => walk(i + 1), LINES[i].ms);
    }

    // Speech voices on some browsers load async — re-trigger when ready.
    if (supportsSpeech && synth!.getVoices().length === 0) {
      const handler = () => { walk(0); synth!.removeEventListener('voiceschanged', handler); };
      synth!.addEventListener('voiceschanged', handler);
      timerRef.current = window.setTimeout(() => walk(0), 800);
    } else {
      timerRef.current = window.setTimeout(() => walk(0), 700);
    }

    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') finish(); };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (timerRef.current) window.clearTimeout(timerRef.current);
      if (supportsSpeech) synth!.cancel();
    };
  }, []);

  function finish() {
    if (closing) return;
    setClosing(true);
    try { sessionStorage.setItem('nd_intro_seen', '1'); } catch { /* ignore */ }
    if (typeof window !== 'undefined') window.speechSynthesis?.cancel();
    setTimeout(onDone, 700);
  }

  return (
    <div ref={rootRef} className={`cinematic-intro ${closing ? 'is-closing' : ''}`} onClick={finish} role="dialog" aria-modal="true" aria-label="Intro narration" tabIndex={-1}>
      <div className="ci-sky" />
      <div className="ci-embers">
        {Array.from({ length: 60 }).map((_, i) => (
          <span
            key={i}
            className="ci-ember"
            style={{
              left: `${(i * 173) % 100}%`,
              animationDelay: `${(i * 0.37) % 8}s`,
              animationDuration: `${8 + (i % 7)}s`,
              opacity: 0.4 + ((i * 17) % 6) / 10,
            }}
          />
        ))}
      </div>
      <div className="ci-sigil-wrap">
        <svg viewBox="0 0 120 140" className="ci-sigil" aria-hidden>
          <defs>
            <radialGradient id="ciGold" cx="50%" cy="40%">
              <stop offset="0%" stopColor="#ffe88a" />
              <stop offset="60%" stopColor="#d6a13d" />
              <stop offset="100%" stopColor="#7a4f12" />
            </radialGradient>
            <filter id="ciGlow">
              <feGaussianBlur stdDeviation="3" />
              <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          {/* Crown */}
          <path
            d="M20 60 L60 18 L100 60 L92 90 L80 80 L72 92 L60 80 L48 92 L40 80 L28 90 Z"
            fill="url(#ciGold)"
            stroke="#ffe88a"
            strokeWidth="1.2"
            filter="url(#ciGlow)"
          />
          <circle cx="60" cy="40" r="4" fill="#fff" filter="url(#ciGlow)" />
          {/* Banner sigil below */}
          <path d="M60 96 L62 130 L60 134 L58 130 Z" fill="#d6a13d" />
        </svg>
        <div className="ci-rings">
          <span className="ci-ring r1" />
          <span className="ci-ring r2" />
          <span className="ci-ring r3" />
        </div>
      </div>

      <div className="ci-narration" aria-live="polite">
        <div className="ci-line" key={idx}>
          {LINES[idx]?.text || ''}
        </div>
      </div>

      <button ref={skipBtnRef} className="ci-skip" onClick={(e) => { e.stopPropagation(); finish(); }} aria-label="Skip intro narration">
        Skip · <kbd>Esc</kbd>
      </button>
    </div>
  );
}
