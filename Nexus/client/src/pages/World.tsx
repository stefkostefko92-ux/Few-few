import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useStore } from '../lib/store';

/**
 * Realm of Nexus — premium world map.
 *
 * The map is composited from authored public-domain art:
 *   - Background: Olaus Magnus' Carta Marina (1539). A famous monsters-
 *     and-ships sea map; we treat it in-fiction as the master cartograph
 *     of the realm. Public domain.
 *   - Compass rose corner: the Cantino windrose (c.1502). Public domain.
 *
 * Region pins are floated over the texture as positioned divs — each one
 * a wax-sealed brass medallion with calligraphic name plate, hand-tied
 * cord, and a glow tinted to the region's biome.
 *
 * Sources catalogued in /public/assets/map/CREDITS.md.
 */

interface Region {
  slug: string;
  level: string;
  minLevel: number;
  /** Fractional position on the map image (0..1). Hand-tuned to land on
   *  visually interesting spots of the Carta Marina. */
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

  return (
    <div className="panel realm-map">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">{t('world.title')}</h2>
          <div className="panel-subtitle">{t('world.subtitle')}</div>
        </div>
      </div>

      <div className="realm-map-frame">
        {/* HD parchment — Carta Marina (1539). */}
        <img className="realm-map-bg" src="/assets/map/parchment.jpg" alt="" aria-hidden />
        {/* Aged-paper colour grade + dark vignette so the gold pins read. */}
        <div className="realm-map-tint" aria-hidden />
        <div className="realm-map-vignette" aria-hidden />

        {/* Ornamental corner flourishes. */}
        <div className="realm-corner tl" aria-hidden />
        <div className="realm-corner tr" aria-hidden />
        <div className="realm-corner bl" aria-hidden />
        <div className="realm-corner br" aria-hidden />

        {/* Compass rose — Cantino windrose (c.1502). */}
        <img className="realm-compass" src="/assets/map/compass.jpg" alt="" aria-hidden />

        {/* Region pins. The whole medallion is a real anchor so every pin
            is tappable on touch and reachable by keyboard; the card is a
            hover/focus tooltip. A pin always deep-links to its own region. */}
        {REGIONS.map((r) => {
          // Match the hunting unlock gate exactly (gate === minLevel) so a
          // pin never invites you into a region the hunt won't yet open.
          const locked = char ? char.level < r.minLevel : false;
          const name = t(`world.regions.${r.slug}.name`, { defaultValue: r.name });
          const lore = t(`world.regions.${r.slug}.lore`, { defaultValue: r.lore });
          return (
            <Link
              key={r.slug}
              to={`/app/hunting?region=${r.slug}`}
              className={`realm-pin ${locked ? 'locked' : ''}`}
              style={{
                left: `${r.x * 100}%`,
                top: `${r.y * 100}%`,
                ['--pin-color' as any]: r.color,
              }}
              aria-label={locked
                ? `${name} (${t('common.lv')} ${r.level}) — ${t('world.requiresLv', { level: r.minLevel })}`
                : `${name} (${t('common.lv')} ${r.level})`}
            >
              <div className="realm-pin-seal" aria-hidden>
                <span className="realm-pin-stamp">{r.stamp}</span>
              </div>
              <div className="realm-pin-card" role="presentation">
                <strong className="realm-pin-name">{name}</strong>
                <div className="realm-pin-meta">{t('common.lv')} {r.level}</div>
                <div className="realm-pin-lore">{lore}</div>
                <div className={`realm-pin-cta ${locked ? 'locked' : ''}`}>
                  {locked ? t('world.requiresLv', { level: r.minLevel }) : `${t('world.enter')} ▸`}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
