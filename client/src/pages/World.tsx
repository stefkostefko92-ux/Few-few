import React from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../lib/store';
import { REGIONS } from '../lib/regions';

/**
 * Realm of Nexus — premium world map.
 *
 * The map is composited from authored public-domain art:
 *   - Background: Olaus Magnus' Carta Marina (1539). A famous monsters-
 *     and-ships sea map; we treat it in-fiction as the master cartograph
 *     of the realm. Public domain.
 *   - Compass rose corner: the Cantino windrose (c.1502). Public domain.
 *
 * Region pins are floated over the texture as positioned links — each one
 * a wax-sealed brass medallion with calligraphic name plate. The WHOLE
 * medallion is a real anchor (not a hover-only popover button), so every
 * region is clickable on touch and by keyboard, and each pin deep-links
 * to that region's own quest board (/app/quests?region=<slug>). The
 * region list is the shared catalog in lib/regions.ts, aligned 1:1 with
 * the slugs the backend actually seeds, so no pin lands on an empty board.
 *
 * Sources catalogued in /public/assets/map/CREDITS.md.
 */

export default function World(): React.ReactElement {
  const char = useStore((s) => s.character);

  return (
    <div className="panel realm-map">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">Map of Nexus</h2>
          <div className="panel-subtitle">From Oaken Hollow to the Eternal Throne — sixteen realms charted on a relic of the last cartographer.</div>
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

        {/* Region pins. Every pin is a Link so it is tappable on touch and
            focusable by keyboard; the info card is a hover/focus tooltip. */}
        {REGIONS.map((r) => {
          const locked = char ? char.level < r.minLevel - 1 : false;
          return (
            <Link
              key={r.slug}
              to={`/app/quests?region=${r.slug}`}
              className={`realm-pin ${locked ? 'locked' : ''}`}
              style={{
                left: `${r.x * 100}%`,
                top: `${r.y * 100}%`,
                ['--pin-color' as any]: r.color,
              }}
              aria-label={locked
                ? `${r.name} (levels ${r.level}) — requires level ${r.minLevel}`
                : `${r.name} (levels ${r.level}) — open quests`}
            >
              <div className="realm-pin-seal" aria-hidden>
                <span className="realm-pin-stamp">{r.stamp}</span>
              </div>
              <div className="realm-pin-card" role="presentation">
                <strong className="realm-pin-name">{r.name}</strong>
                <div className="realm-pin-meta">Lv {r.level}</div>
                <div className="realm-pin-lore">{r.lore}</div>
                <div className={`realm-pin-cta ${locked ? 'locked' : ''}`}>
                  {locked ? `Requires Lv ${r.minLevel}` : 'Enter ▸'}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
