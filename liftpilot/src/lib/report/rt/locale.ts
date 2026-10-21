// «Locale del macchinario» of the relazione tecnica di modifica (RT plan §5.1; owner's decision 1): on the room path the
// blocks of the former relazione tecnica of the replacement — the room and the shaft under it as surveyed, the drops,
// where the new machine stands on its support with its mounts (tecnica-room.ts roomRows), the openings in the slab with
// their place and the existing ones surveyed, the hook and the masses it lifts (tecnica-site.ts), the plan and section
// B-B (surveyBlocks), the room's checks in the section's grid and what to survey on site; the loads on the slab are
// in «Strutture dell’edificio». On the shaft path, the lift design's machine room: its checks, the rest in the
// relazione di calcolo of the design and on sheet 1. Pure.
import type { SezioneRt } from '../../rt/types';
import { machineText } from '../../tavole/machine-name';
import type { ReportBlock } from '../model';
import { roomRows, surveyBlocks } from '../tecnica-room';
import { hookBlocks, openingsBlocks, siteChecks } from '../tecnica-site';
import type { Ctx } from './contesto';
import { sezioneBlocks } from './sezione';
import { DOC, fill } from './testi';

const L = DOC.locale;

/** The machine room as surveyed with the new machine in it: rows, openings, hook, plan and section B-B. */
export function localeRilievo(x: Ctx): ReportBlock[] {
  const room = x.base.room;
  if (!room) return [{ t: 'p', style: 'note', text: L.progetto }];
  const d = room.derived, s = room.survey, { fmt } = x, named = machineText(x.r.plant, d.made);
  return [
    { t: 'kv', rows: roomRows(s, d, fmt) },
    ...openingsBlocks(d, s, fmt), ...hookBlocks(d, fmt),
    ...surveyBlocks(d, { ...d.M, label: named }),
    { t: 'p', style: 'note', text: fill(L.carichi, { sezione: x.titolo('strutture') }) },
  ];
}

/** What to survey on site for the room: the drops, the openings, the sizes, the pulleys, the bearings and the
 *  survey's own findings. */
export function localeSito(x: Ctx): ReportBlock[] {
  const room = x.base.room;
  if (!room) return [];
  const d = room.derived;
  return [{ t: 'h3', text: L.rilievi }, { t: 'list', items: [L.calate, L.aperture, L.misure, ...(d.M.Dp > 0 ? [L.rinvio] : []), L.appoggi, ...siteChecks(room.survey)] }];
}

export const localeBlocks = (x: Ctx, s: SezioneRt): ReportBlock[] => sezioneBlocks(x, s, { prima: localeRilievo(x), dopo: localeSito(x) });
