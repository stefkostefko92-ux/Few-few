import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useStore } from '../lib/store';
import { WORLD_PINS } from '../data/worldPins';
import '../styles/world.css';

/**
 * Карта на света — фотореалистичен рендер (собствено генерирано съдържание,
 * client/scripts/bake-map). Пиновете се позиционират от проекцията на
 * камерата на рендера (src/data/worldPins.ts). Zoom/pan: колелце, влачене,
 * pinch; клавиши +/-/стрелки. Уважава prefers-reduced-motion.
 */

interface Region {
  slug: string;
  level: string;
  minLevel: number;
  /** Резервна позиция (0..1) — реалната идва от WORLD_PINS. */
  x: number;
  y: number;
  /** Biome glow colour. */
  color: string;
  /** Pin medallion stamp letter. */
  stamp: string;
  /** English name/lore — used as the i18n defaultValue so a pin never
   *  renders a raw key even if a locale is missing the entry. */
  name: string;
  lore: string;
}

/* The slugs MUST match the regions the backend actually serves for hunting
 * (server/src/routes/hunting.ts REGION_ORDER + seed/monsters REGION_BANDS)
 * — a pin deep-links to /app/hunting?region=<slug>, which Hunting.tsx reads
 * from the URL. The previous map advertised 15 fictional slugs (frostspire,
 * drowned_coast, voidmaw, …) that no region matched, so every pin opened an
 * empty hunt. Names/lore are localised via `world.regions.<slug>.{name,lore}`
 * with the English text below as the fallback. Level bands follow the
 * hunting region gates. */
const REGIONS: Region[] = [
  { slug: 'whispering_woods', level: '1-5',     minLevel: 1,   x: 0.14, y: 0.80, color: '#6ad8a4', stamp: 'I',    name: 'Whispering Woods', lore: 'A green wood near Oaken Hollow — every hero’s first road.' },
  { slug: 'mistmoor_hills',   level: '6-9',     minLevel: 6,   x: 0.24, y: 0.64, color: '#9ad9ff', stamp: 'II',   name: 'Mistmoor Hills',   lore: 'Fog-laced highlands where orcs ride the high passes.' },
  { slug: 'crystal_caverns',  level: '10-14',   minLevel: 10,  x: 0.38, y: 0.76, color: '#6aa7ff', stamp: 'III',  name: 'Crystal Caverns',  lore: 'A labyrinth of glittering ore beneath the mountains.' },
  { slug: 'ashen_wastes',     level: '15-23',   minLevel: 15,  x: 0.52, y: 0.60, color: '#ff7c4d', stamp: 'IV',   name: 'Ashen Wastes',     lore: 'Burned plains where revenants drift and drakes wheel above.' },
  { slug: 'shadowfell',       level: '24-25',   minLevel: 24,  x: 0.63, y: 0.76, color: '#c294ff', stamp: 'V',    name: 'The Shadowfell',   lore: 'The Shadow Lord’s domain. Bring everything.' },
  { slug: 'emberreach',       level: '26-49',   minLevel: 26,  x: 0.76, y: 0.62, color: '#ff7c4d', stamp: 'VI',   name: 'Emberreach',       lore: 'Smouldering canyons where dragonkind nest.' },
  { slug: 'hammerhand_pass',  level: '50-74',   minLevel: 50,  x: 0.87, y: 0.47, color: '#d6a13d', stamp: 'VII',  name: 'Hammerhand Pass',  lore: 'A dwarf-cut mountain road guarding the ore caravans.' },
  { slug: 'conclave_aedric',  level: '75-104',  minLevel: 75,  x: 0.71, y: 0.39, color: '#b9a6ff', stamp: 'VIII', name: 'Conclave of Aedric', lore: 'A cloistered city of mages and their unquiet apprentices.' },
  { slug: 'saltmarsh',        level: '105-139', minLevel: 105, x: 0.17, y: 0.46, color: '#5dd4d0', stamp: 'IX',   name: 'Saltmarsh',        lore: 'Sunken cities along a haunted, brackish shoreline.' },
  { slug: 'frostvale',        level: '140-174', minLevel: 140, x: 0.30, y: 0.33, color: '#a8e6ff', stamp: 'X',    name: 'Frostvale',        lore: 'Glacial valleys under a sky of perpetual aurora.' },
  { slug: 'black_spire',      level: '175-200', minLevel: 175, x: 0.45, y: 0.42, color: '#e0863d', stamp: 'XI',   name: 'Black Spire',      lore: 'A volcanic fortress-tower ruled by a fallen king.' },
  { slug: 'stormpeaks',       level: '201-230', minLevel: 201, x: 0.58, y: 0.30, color: '#b9d8ff', stamp: 'XII',  name: 'The Stormpeaks',   lore: 'Lightning-wracked summits ruled by storm giants.' },
  { slug: 'voidshade_hollow', level: '231-260', minLevel: 231, x: 0.71, y: 0.22, color: '#8b6cff', stamp: 'XIII', name: 'Voidshade Hollow', lore: 'A bottomless chasm that devours its own gravity.' },
  { slug: 'mooncradle',       level: '261-290', minLevel: 261, x: 0.40, y: 0.18, color: '#c294ff', stamp: 'XIV',  name: 'Mooncradle',       lore: 'A tear in reality where stars bleed into the sky.' },
  { slug: 'worldspine',       level: '291-320', minLevel: 291, x: 0.24, y: 0.23, color: '#ff5a4d', stamp: 'XV',   name: 'The Worldspine',   lore: 'The wyrm-king’s mountain throne, spine of the known world.' },
  { slug: 'eternal_throne',   level: '321-350', minLevel: 321, x: 0.86, y: 0.82, color: '#ffd34d', stamp: 'XVI',  name: 'The Eternal Throne', lore: 'Where the Last Sovereign waits at the end of all roads.' },
  // „Отвъд Края" (351-500) — светът след падането на The Unname.
  { slug: 'ashen_veil',       level: '351-380', minLevel: 351, x: 0.10, y: 0.12, color: '#9aa0ad', stamp: 'XVII',  name: 'The Ashen Veil',     lore: 'What remains when an ending ends. Ash, echo, and the patient dead.' },
  { slug: 'starfall_abyss',   level: '381-410', minLevel: 381, x: 0.53, y: 0.10, color: '#6a8dff', stamp: 'XVIII', name: 'The Starfall Abyss', lore: 'The grave of fallen stars. Light goes in; something else comes out.' },
  { slug: 'forge_of_dawn',    level: '411-440', minLevel: 411, x: 0.80, y: 0.10, color: '#ffb84d', stamp: 'XIX',   name: 'The Forge of Dawn',  lore: 'Where the next world is being hammered. The smiths do not stop for visitors.' },
  { slug: 'crown_of_night',   level: '441-470', minLevel: 441, x: 0.93, y: 0.26, color: '#5b4dff', stamp: 'XX',    name: 'The Crown of Night', lore: 'The court of the Unlit Crown, where the dark keeps its own throne.' },
  { slug: 'first_light',      level: '471-500', minLevel: 471, x: 0.94, y: 0.64, color: '#fff1b8', stamp: 'XXI',   name: 'The First Light',    lore: 'The beginning before everything. The last road ends where the first one starts.' },
];

export default function World(): React.ReactElement {
  const { t } = useTranslation();
  const char = useStore((s) => s.character);
  const frame = React.useRef<HTMLDivElement>(null);
  const [view, setView] = React.useState({ k: 1, x: 0, y: 0 });
  const drag = React.useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);
  const pts = React.useRef(new Map<number, { x: number; y: number }>());
  const pinch = React.useRef(0);

  const clamp = React.useCallback((v: { k: number; x: number; y: number }) => {
    const el = frame.current;
    const k = Math.min(4, Math.max(1, v.k));
    if (!el) return { ...v, k };
    const w = el.clientWidth, h = el.clientHeight;
    return { k, x: Math.min(0, Math.max(w - w * k, v.x)), y: Math.min(0, Math.max(h - h * k, v.y)) };
  }, []);
  const zoomAt = React.useCallback((f: number, cx: number, cy: number) => {
    setView((v) => {
      const k = Math.min(4, Math.max(1, v.k * f));
      const r = k / v.k;
      return clamp({ k, x: cx - (cx - v.x) * r, y: cy - (cy - v.y) * r });
    });
  }, [clamp]);

  React.useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const b = el.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - b.left, e.clientY - b.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  const onDown = (e: React.PointerEvent) => {
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.current.size === 2) {
      const [a, b] = [...pts.current.values()];
      pinch.current = Math.hypot(a.x - b.x, a.y - b.y);
    }
    drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false };
  };
  const onMove = (e: React.PointerEvent) => {
    if (!pts.current.has(e.pointerId)) return;
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.current.size === 2) {
      const [a, b] = [...pts.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const bb = frame.current!.getBoundingClientRect();
      if (pinch.current) zoomAt(d / pinch.current, (a.x + b.x) / 2 - bb.left, (a.y + b.y) / 2 - bb.top);
      pinch.current = d;
      if (drag.current) drag.current.moved = true;
      return;
    }
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
    if (d.moved) setView((v) => clamp({ k: v.k, x: d.vx + dx, y: d.vy + dy }));
  };
  const onUp = (e: React.PointerEvent) => {
    pts.current.delete(e.pointerId);
    pinch.current = 0;
    if (pts.current.size === 0) setTimeout(() => { drag.current = null; }, 0);
  };
  const onKey = (e: React.KeyboardEvent) => {
    const el = frame.current;
    if (!el || e.target !== el) return;
    const w = el.clientWidth, h = el.clientHeight;
    if (e.key === '+' || e.key === '=') zoomAt(1.3, w / 2, h / 2);
    else if (e.key === '-') zoomAt(1 / 1.3, w / 2, h / 2);
    else if (e.key === '0') setView({ k: 1, x: 0, y: 0 });
    else if (e.key === 'ArrowLeft') setView((v) => clamp({ ...v, x: v.x + 60 }));
    else if (e.key === 'ArrowRight') setView((v) => clamp({ ...v, x: v.x - 60 }));
    else if (e.key === 'ArrowUp') setView((v) => clamp({ ...v, y: v.y + 60 }));
    else if (e.key === 'ArrowDown') setView((v) => clamp({ ...v, y: v.y - 60 }));
    else return;
    e.preventDefault();
  };

  return (
    <section className="panel wm" aria-label={t('world.title')}>
      <header className="wm-head">
        <div>
          <h2 className="wm-title">{t('world.title')}</h2>
          <div className="wm-sub">{t('world.subtitle')}</div>
        </div>
        <div className="wm-ctl" role="group" aria-label="Zoom">
          <button type="button" onClick={() => zoomAt(1 / 1.3, (frame.current?.clientWidth ?? 0) / 2, (frame.current?.clientHeight ?? 0) / 2)} aria-label="−">−</button>
          <button type="button" onClick={() => setView({ k: 1, x: 0, y: 0 })} aria-label="1:1">1×</button>
          <button type="button" onClick={() => zoomAt(1.3, (frame.current?.clientWidth ?? 0) / 2, (frame.current?.clientHeight ?? 0) / 2)} aria-label="+">+</button>
        </div>
      </header>

      <div
        ref={frame}
        className="wm-frame"
        tabIndex={0}
        role="group"
        aria-label={t('world.title')}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onKeyDown={onKey}
      >
        <div className="wm-stage" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`, ['--inv' as any]: 1 / view.k }}>
          <img
            className="wm-img"
            src="/assets/map/world-1920.webp"
            srcSet="/assets/map/world-960.webp 960w, /assets/map/world-1920.webp 1920w, /assets/map/world.webp 3840w"
            sizes="(min-width: 1100px) 1100px, 100vw"
            alt="Фотореалистична нощна карта на Нексус: лунно осветен континент с планини, реки, лава и замъци, заобиколен от острови."
            draggable={false}
          />
          {REGIONS.map((r) => {
            const locked = char ? char.level < r.minLevel : false;
            const name = t(`world.regions.${r.slug}.name`, { defaultValue: r.name });
            const lore = t(`world.regions.${r.slug}.lore`, { defaultValue: r.lore });
            const [px, py] = WORLD_PINS[r.slug] ?? [r.x, r.y];
            return (
              <Link
                key={r.slug}
                to={`/app/hunting?region=${r.slug}`}
                className={`wm-pin ${locked ? 'locked' : ''} ${py < 0.34 ? 'down' : ''} ${px > 0.72 ? 'left' : ''}`}
                style={{ left: `${px * 100}%`, top: `${py * 100}%`, ['--pin' as any]: r.color }}
                onClick={(e) => { if (drag.current?.moved) e.preventDefault(); }}
                aria-label={locked
                  ? `${name} (${t('common.lv')} ${r.level}) — ${t('world.requiresLv', { level: r.minLevel })}`
                  : `${name} (${t('common.lv')} ${r.level})`}
              >
                <span className="wm-seal" aria-hidden>{locked ? '' : r.stamp}</span>
                <span className="wm-card">
                  <img src={`/assets/regions/${r.slug}.webp`} alt="" loading="lazy" draggable={false} />
                  <strong>{name}</strong>
                  <em>{t('common.lv')} {r.level}</em>
                  <span className="wm-lore">{lore}</span>
                  <span className={`wm-cta ${locked ? 'locked' : ''}`}>
                    {locked ? t('world.requiresLv', { level: r.minLevel }) : t('world.enter')}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
