import React from 'react';
import { Link } from 'react-router-dom';
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
  name: string;
  level: string;
  minLevel: number;
  lore: string;
  /** Fractional position on the map image (0..1). Hand-tuned to land on
   *  visually interesting spots of the Carta Marina. */
  x: number;
  y: number;
  /** Biome glow colour. */
  color: string;
  /** Pin medallion stamp letter. */
  stamp: string;
}

const REGIONS: Region[] = [
  { slug: 'whispering_woods',  name: 'Whispering Woods',  level: '1-5',     minLevel: 1,    lore: 'A green wood near Oaken Hollow.',                             x: 0.16, y: 0.78, color: '#6ad8a4', stamp: 'I'    },
  { slug: 'mistmoor_hills',    name: 'Mistmoor Hills',    level: '6-10',    minLevel: 6,    lore: 'Fog-laced highlands stalked by orcs.',                        x: 0.27, y: 0.62, color: '#9ad9ff', stamp: 'II'   },
  { slug: 'crystal_caverns',   name: 'Crystal Caverns',   level: '11-15',   minLevel: 11,   lore: 'Glittering tunnels beneath the mountains.',                   x: 0.41, y: 0.74, color: '#6aa7ff', stamp: 'III'  },
  { slug: 'ashen_wastes',      name: 'Ashen Wastes',      level: '17-22',   minLevel: 17,   lore: 'Burned plains roamed by drakes.',                             x: 0.55, y: 0.56, color: '#ff7c4d', stamp: 'IV'   },
  { slug: 'shadowfell',        name: 'The Shadowfell',    level: '25',      minLevel: 25,   lore: 'The Shadow Lord\'s domain. Bring everything.',                x: 0.66, y: 0.74, color: '#c294ff', stamp: 'V'    },
  { slug: 'emberreach',        name: 'Emberreach',        level: '26-59',   minLevel: 26,   lore: 'Smouldering canyons where dragonkind nest.',                  x: 0.78, y: 0.58, color: '#ff7c4d', stamp: 'VI'   },
  { slug: 'frostspire',        name: 'Frostspire',        level: '60-94',   minLevel: 60,   lore: 'Glacial peaks under a sky of perpetual aurora.',              x: 0.86, y: 0.36, color: '#a8e6ff', stamp: 'VII'  },
  { slug: 'drowned_coast',     name: 'Drowned Coast',     level: '95-129',  minLevel: 95,   lore: 'Sunken cities along a haunted shoreline.',                    x: 0.20, y: 0.42, color: '#5dd4d0', stamp: 'VIII' },
  { slug: 'stormpeaks',        name: 'Stormpeaks',        level: '130-164', minLevel: 130,  lore: 'Lightning-wracked summits ruled by storm giants.',            x: 0.36, y: 0.30, color: '#b9d8ff', stamp: 'IX'   },
  { slug: 'blighted_expanse',  name: 'Blighted Expanse',  level: '165-199', minLevel: 165,  lore: 'A withered moor where the dead walk.',                        x: 0.50, y: 0.34, color: '#86c46a', stamp: 'X'    },
  { slug: 'obsidian_dominion', name: 'Obsidian Dominion', level: '200-234', minLevel: 200,  lore: 'A volcanic fortress-state ruled by a fallen king.',           x: 0.62, y: 0.22, color: '#d6a13d', stamp: 'XI'   },
  { slug: 'astral_rift',       name: 'Astral Rift',       level: '235-269', minLevel: 235,  lore: 'A tear in reality where stars bleed into the sky.',          x: 0.74, y: 0.18, color: '#c294ff', stamp: 'XII'  },
  { slug: 'voidmaw',           name: 'Voidmaw',           level: '270-304', minLevel: 270,  lore: 'A bottomless chasm devouring its own gravity.',               x: 0.50, y: 0.86, color: '#8b6cff', stamp: 'XIII' },
  { slug: 'dragon_roost',      name: 'Dragon Roost',      level: '305-339', minLevel: 305,  lore: 'The wyrm-king\'s mountain throne.',                           x: 0.34, y: 0.90, color: '#ff5a4d', stamp: 'XIV'  },
  { slug: 'eternal_throne',    name: 'Eternal Throne',    level: '340-350', minLevel: 340,  lore: 'Where the Last Sovereign waits.',                             x: 0.86, y: 0.86, color: '#ffd34d', stamp: 'XV'   },
];

export default function World(): React.ReactElement {
  const char = useStore((s) => s.character);

  return (
    <div className="panel realm-map">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">Map of Nexus</h2>
          <div className="panel-subtitle">From Oaken Hollow to the Eternal Throne — fifteen realms charted on a relic of the last cartographer.</div>
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

        {/* Region pins. */}
        {REGIONS.map((r) => {
          const locked = char ? char.level < r.minLevel - 1 : false;
          return (
            <div
              key={r.slug}
              className={`realm-pin ${locked ? 'locked' : ''}`}
              style={{
                left: `${r.x * 100}%`,
                top: `${r.y * 100}%`,
                ['--pin-color' as any]: r.color,
              }}
            >
              <div className="realm-pin-seal" aria-hidden>
                <span className="realm-pin-stamp">{r.stamp}</span>
              </div>
              <div className="realm-pin-card">
                <strong className="realm-pin-name">{r.name}</strong>
                <div className="realm-pin-meta">Lv {r.level}</div>
                <div className="realm-pin-lore">{r.lore}</div>
                {!locked ? (
                  <Link to="/app/quests" className="btn btn-sm btn-primary realm-pin-cta">Enter</Link>
                ) : (
                  <div className="realm-pin-cta locked">Requires Lv {r.minLevel}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
