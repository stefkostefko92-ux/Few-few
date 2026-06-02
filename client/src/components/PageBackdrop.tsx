import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Per-page HD backdrop, fixed-position behind the app shell.
 *
 * Each route picks a public-domain painting that visually matches the
 * tab's purpose — Velázquez's Forge of Vulcan for the smithy, Bruegel's
 * Tower of Babel for the Tower, the Hereford Mappa Mundi for the world
 * map, etc. Source files live in /public/assets/bg/<scene>.jpg.
 *
 * Behaviours:
 *   - Two stacked <img> layers cross-fade when the scene changes, so the
 *     route transition gets a 700ms dissolve instead of a hard cut.
 *   - A slow Ken Burns pan/zoom keeps every backdrop feeling alive
 *     without a single moving pixel of code. Pure CSS animation.
 *   - A scene-tinted radial + linear overlay sits above the image so the
 *     UI chrome on top of it remains legible regardless of how bright the
 *     underlying painting is.
 *   - Image attribution / source lineage lives in assets/bg/CREDITS.md.
 */

type Scene =
  | 'forge' | 'tower' | 'camp' | 'auction' | 'bounty'
  | 'market' | 'stables' | 'recipe' | 'trialcache'
  | 'battlepass' | 'guild' | 'world' | 'default';

function sceneFor(pathname: string): Scene {
  if (pathname.startsWith('/app/forge'))        return 'forge';
  if (pathname.startsWith('/app/tower'))        return 'tower';
  if (pathname.startsWith('/app/camp'))         return 'camp';
  if (pathname.startsWith('/app/auction'))      return 'auction';
  if (pathname.startsWith('/app/bounties'))     return 'bounty';
  if (pathname.startsWith('/app/market'))       return 'market';
  if (pathname.startsWith('/app/stables'))      return 'stables';
  if (pathname.startsWith('/app/recipes'))      return 'recipe';
  if (pathname.startsWith('/app/trial-cache'))  return 'trialcache';
  if (pathname.startsWith('/app/battlepass'))   return 'battlepass';
  if (pathname.startsWith('/app/guild'))        return 'guild';
  if (pathname.startsWith('/app/world')
      || pathname.startsWith('/app/quests'))    return 'world';
  return 'default';
}

const IMG_FOR: Record<Scene, string> = {
  forge:       '/assets/bg/forge.jpg',
  tower:       '/assets/bg/tower.jpg',
  camp:        '/assets/bg/camp.jpg',
  auction:     '/assets/bg/auction.jpg',
  bounty:      '/assets/bg/bounty.jpg',
  market:      '/assets/bg/market.jpg',
  stables:     '/assets/bg/stables.jpg',
  recipe:      '/assets/bg/recipe.jpg',
  trialcache:  '/assets/bg/trialcache.jpg',
  battlepass:  '/assets/bg/battlepass.jpg',
  guild:       '/assets/bg/auction.jpg', /* uses Veronese banquet — same source family */
  world:       '/assets/bg/world.jpg',
  default:     '/assets/bg/default.jpg',
};

/** Scene-specific tint overlay sitting on top of the HD photo so the
 *  app chrome (gold accents, dark cards) reads cleanly regardless of how
 *  bright the underlying painting is. */
const TINT: Record<Scene, string> = {
  forge:       'radial-gradient(ellipse at 50% 80%, rgba(255,120,40,.28), transparent 65%), linear-gradient(180deg, rgba(8,4,2,.55) 0%, rgba(20,8,4,.80) 100%)',
  tower:       'radial-gradient(circle at 50% 35%, rgba(194,148,255,.22), transparent 55%), linear-gradient(180deg, rgba(8,6,16,.60) 0%, rgba(6,4,12,.82) 100%)',
  camp:        'radial-gradient(ellipse at 50% 85%, rgba(255,170,90,.18), transparent 55%), linear-gradient(180deg, rgba(6,8,14,.58) 0%, rgba(4,6,10,.82) 100%)',
  auction:     'radial-gradient(ellipse at 50% 40%, rgba(255,232,138,.20), transparent 55%), linear-gradient(180deg, rgba(10,8,4,.55) 0%, rgba(6,4,8,.82) 100%)',
  bounty:      'radial-gradient(ellipse at 50% 100%, rgba(232,90,79,.20), transparent 60%), linear-gradient(180deg, rgba(12,6,4,.62) 0%, rgba(8,4,6,.84) 100%)',
  market:      'radial-gradient(ellipse at 50% 80%, rgba(214,161,61,.14), transparent 50%), linear-gradient(180deg, rgba(10,8,10,.60) 0%, rgba(6,6,10,.82) 100%)',
  stables:     'radial-gradient(ellipse at 50% 55%, rgba(106,167,255,.16), transparent 50%), linear-gradient(180deg, rgba(8,10,16,.58) 0%, rgba(6,6,12,.82) 100%)',
  recipe:      'radial-gradient(ellipse at 50% 70%, rgba(106,216,164,.18), transparent 55%), linear-gradient(180deg, rgba(6,12,10,.58) 0%, rgba(4,8,6,.82) 100%)',
  trialcache:  'radial-gradient(ellipse at 30% 30%, rgba(194,148,255,.24), transparent 55%), linear-gradient(180deg, rgba(8,4,18,.60) 0%, rgba(6,4,12,.82) 100%)',
  battlepass:  'radial-gradient(circle at 80% 25%, rgba(106,167,255,.20), transparent 55%), linear-gradient(180deg, rgba(6,10,18,.58) 0%, rgba(4,6,10,.82) 100%)',
  guild:       'radial-gradient(ellipse at 50% 50%, rgba(214,161,61,.16), transparent 50%), linear-gradient(180deg, rgba(10,8,4,.60) 0%, rgba(6,4,4,.82) 100%)',
  world:       'radial-gradient(ellipse at 50% 60%, rgba(255,232,138,.12), transparent 50%), linear-gradient(180deg, rgba(8,8,10,.55) 0%, rgba(4,6,10,.78) 100%)',
  default:     'radial-gradient(ellipse at 50% 50%, rgba(214,161,61,.12), transparent 55%), linear-gradient(180deg, rgba(6,8,12,.60) 0%, rgba(4,6,10,.82) 100%)',
};

export default function PageBackdrop(): React.ReactElement {
  const { pathname } = useLocation();
  const scene = sceneFor(pathname);
  // Two layers cross-fade. `currentSrc` is the live image; `prevSrc` is
  // the outgoing one held for the duration of the fade so we don't get a
  // flash to nothing while the new one loads.
  const [currentSrc, setCurrentSrc] = useState<string>(IMG_FOR[scene]);
  const [prevSrc, setPrevSrc] = useState<string | null>(null);
  const fadeTimer = useRef<number | null>(null);

  useEffect(() => {
    const next = IMG_FOR[scene];
    if (next === currentSrc) return;
    setPrevSrc(currentSrc);
    setCurrentSrc(next);
    if (fadeTimer.current) window.clearTimeout(fadeTimer.current);
    fadeTimer.current = window.setTimeout(() => setPrevSrc(null), 900);
    // Pre-warm the next image in case the user keeps navigating quickly.
    return () => { if (fadeTimer.current) window.clearTimeout(fadeTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene]);

  const tint = TINT[scene] || TINT.default;

  return (
    <div className="page-backdrop" aria-hidden style={WRAP_STYLE}>
      {prevSrc && (
        <img
          src={prevSrc}
          alt=""
          style={{ ...IMG_STYLE, opacity: 0, transition: 'opacity 800ms ease-out' }}
          /* The previous image fades out over 800ms; it gets removed
             from the tree after 900ms by the effect above. */
        />
      )}
      <img
        key={currentSrc}
        src={currentSrc}
        alt=""
        style={IMG_STYLE}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: tint,
          transition: 'background 800ms ease-in-out',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}

const WRAP_STYLE: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: -1,
  overflow: 'hidden',
  background: '#04060a',
};

const IMG_STYLE: React.CSSProperties = {
  position: 'absolute',
  inset: '-4%',                 // bleed for the Ken-Burns zoom
  width: '108%',
  height: '108%',
  objectFit: 'cover',
  objectPosition: 'center',
  filter: 'saturate(0.9) contrast(1.05)',
  animation: 'page-backdrop-kenburns 38s ease-in-out infinite alternate',
  willChange: 'transform, opacity',
};
