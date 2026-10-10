import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { KEY_ART, regionArt } from '../lib/regions';

/**
 * Фон на всяка страница, фиксиран зад обвивката на приложението.
 *
 * Дизайн-системата „Dominion“: всяка сцена ползва фотореалистичен рендер —
 * ключовата илюстрация на играта или изпечения пейзаж на регион, който
 * отговаря на смисъла на раздела (Ковачницата на зората за ковачницата,
 * Черният шпил за кулата и т.н.). Рендерите на регионите живеят в
 * /public/assets/regions/<slug>.webp; ако някой липсва, слоят пада обратно
 * към ключовата илюстрация, без празен кадър.
 *
 * Поведение:
 *   - Два постоянни <img> слоя се преливат при смяна на сцената (800ms),
 *     така Ken Burns анимацията не се рестартира при навигация.
 *   - Тъмносин тониран слой отгоре държи панелите четими върху всеки рендер.
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
  forge:       regionArt('forge_of_dawn'),
  tower:       regionArt('black_spire'),
  camp:        regionArt('whispering_woods'),
  auction:     regionArt('conclave_aedric'),
  bounty:      regionArt('ashen_wastes'),
  market:      regionArt('saltmarsh'),
  stables:     regionArt('mistmoor_hills'),
  recipe:      regionArt('crystal_caverns'),
  trialcache:  regionArt('voidshade_hollow'),
  battlepass:  regionArt('stormpeaks'),
  guild:       regionArt('hammerhand_pass'),
  world:       regionArt('frostvale'),
  default:     KEY_ART,
};

/** Акцент на сцената — едва доловим отблясък върху общия тъмносин тон. */
const ACCENT: Record<Scene, string> = {
  forge:       'rgba(255,150,70,.16)',
  tower:       'rgba(231,120,111,.14)',
  camp:        'rgba(106,216,164,.12)',
  auction:     'rgba(185,165,255,.14)',
  bounty:      'rgba(231,120,111,.14)',
  market:      'rgba(103,230,239,.12)',
  stables:     'rgba(163,246,248,.12)',
  recipe:      'rgba(103,230,239,.14)',
  trialcache:  'rgba(185,165,255,.16)',
  battlepass:  'rgba(163,246,248,.14)',
  guild:       'rgba(199,167,123,.14)',
  world:       'rgba(163,246,248,.12)',
  default:     'rgba(103,230,239,.12)',
};

const tintFor = (scene: Scene): string =>
  `radial-gradient(ellipse at 70% 0%, ${ACCENT[scene]}, transparent 60%),`
  + ' linear-gradient(90deg, rgba(7,11,17,.9) 0%, rgba(7,11,17,.74) 45%, rgba(7,11,17,.82) 100%),'
  + ' linear-gradient(180deg, rgba(7,11,17,.35) 0%, rgba(7,11,17,.92) 100%)';

export default function PageBackdrop(): React.ReactElement {
  const { pathname } = useLocation();
  const scene = sceneFor(pathname);
  // Два постоянни слоя (A/B): при смяна на сцената обновяваме скрития и
  // преливаме — re-key на <img> би рестартирал Ken Burns от scale 1.00.
  const [srcA, setSrcA] = useState<string>(IMG_FOR[scene]);
  const [srcB, setSrcB] = useState<string>(IMG_FOR[scene]);
  const [frontIsA, setFrontIsA] = useState(true);

  useEffect(() => {
    const next = IMG_FOR[scene];
    const front = frontIsA ? srcA : srcB;
    if (next === front) return;
    if (frontIsA) setSrcB(next); else setSrcA(next);
    // Един кадър отлагане — новото изображение се декодира в слоя си,
    // преди да тръгне преливането (без проблясък на празен слой).
    const id = requestAnimationFrame(() => setFrontIsA((v) => !v));
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene]);

  // Липсващ рендер на регион → ключовата илюстрация (никога празен фон).
  const fallback = (e: React.SyntheticEvent<HTMLImageElement>): void => {
    const img = e.currentTarget;
    if (!img.src.endsWith(KEY_ART)) img.src = KEY_ART;
  };

  return (
    <div className="page-backdrop" aria-hidden style={WRAP_STYLE}>
      <img
        src={srcA}
        alt=""
        decoding="async"
        onError={fallback}
        style={{ ...IMG_STYLE, opacity: frontIsA ? 1 : 0, transition: 'opacity 800ms ease-out' }}
      />
      <img
        src={srcB}
        alt=""
        decoding="async"
        onError={fallback}
        style={{ ...IMG_STYLE, opacity: frontIsA ? 0 : 1, transition: 'opacity 800ms ease-out' }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: tintFor(scene),
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
  background: '#070b11',
};

const IMG_STYLE: React.CSSProperties = {
  position: 'absolute',
  inset: '-4%',                 // запас за Ken Burns увеличението
  width: '108%',
  height: '108%',
  objectFit: 'cover',
  objectPosition: 'center',
  filter: 'saturate(0.85) contrast(1.05)',
  animation: 'page-backdrop-kenburns 38s ease-in-out infinite alternate',
  willChange: 'transform, opacity',
};
