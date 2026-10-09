'use client';

// The room over the shaft: whether the design has one, and its fields (RoomFields). With a machine above it is the
// machine room, drawn in plan and in section B-B and checked (height, free area in front of the panel, door, beams). A
// room added starts with every measure to enter (src/lib/lift/blank.ts) but the panel's place when the software places
// it. With a machine below and its pulleys over the slab (scheme room) it is the pulley room the scheme cannot do
// without: no switch, its size, height, slab and door only, checked for its height, its door and the space over the
// pulleys (src/lib/lift/below-checks.ts); a design saved without one shows the software's standard room it is drawn and
// checked as, until a measure is entered (the design's own from then: ownPulleyRoom).
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { RoomInputs, ShaftInputs } from '@/shaft';
import { ROOM_FIELDS, ROOM_PLACEHOLDER, filled, isBlankKey, ownPulleyRoom, roomAdded, type BlankKey } from '@/lib/lift/blank';
import { NO_BLANK, StdBadge, type FormBlank, type ShaftSet } from '../blank';
import RoomFields, { type RoomMachine, type RoomPanel } from './RoomFields';

/** The pulley room of scheme room: the software's standard room (a design without one is drawn and checked as it) and
 *  the least height, door and space over the pulleys it is checked against [mm]. */
export interface PulleyRoom {
  standard: RoomInputs;
  minH: number;
  doorW: number;
  doorH: number;
  above: number;
}

interface Props {
  I: ShaftInputs;
  set: ShaftSet;
  /** unfolded at first (else only with measures to enter) */
  open?: boolean;
  /** the machine (its sheave, the axis on shims, where its pulley turns): the support's fields; missing: none shown */
  machine?: RoomMachine;
  blank?: FormBlank;
  /** the control panel's place by the software (a whole design); missing: entered */
  panel?: RoomPanel;
  /** the pulley room of a machine below (scheme room); missing: the machine room */
  pulley?: PulleyRoom;
}

export default function RoomOptions({ I, set, open = false, machine, blank = NO_BLANK, panel, pulley }: Props) {
  const t = useTranslations('shaft'), tb = useTranslations('blank'), own = I.room;
  // a pulley room the design has not got: the software's standard one, until a measure is entered
  const std = own === null && pulley !== undefined, R = own ?? pulley?.standard ?? null;
  // unfolded when it comes with measures to enter; then as the user leaves it
  const [unfolded] = useState(() => open || std || (own !== null && ROOM_FIELDS.some((k) => blank.is(`room.${k}`))));
  // the measures entered (the ridge of a flat roof and the support are no project data to enter)
  const keys = (entered: readonly string[]): BlankKey[] => entered.map((k) => `room.${k}`).filter(isBlankKey);
  // the first measure entered makes the standard room the design's own, with a panel the save takes (none to enter)
  const put = (patch: Partial<RoomInputs>, entered: readonly (keyof RoomInputs)[] = []): void => {
    const base = std && pulley ? ownPulleyRoom(pulley.standard) : R;
    if (base) set({ room: { ...base, ...patch } }, (b) => filled(b, keys(entered)));
  };
  return (
    <details className="room-options" open={unfolded || undefined}>
      <summary>{t(pulley ? 'rm_pulley_title' : 'rm_title')}{std ? <> <StdBadge /></> : null}</summary>
      {pulley ? <p className="note">{t('rm_pulley_hint', { H: String(pulley.minH), W: String(pulley.doorW), D: String(pulley.doorH), above: String(pulley.above) })}</p> : (
        <label className="check">
          <input type="checkbox" checked={own !== null} onChange={(e) => { const on = e.target.checked; set({ room: on ? ROOM_PLACEHOLDER : null }, (b) => (on ? roomAdded(b) : [...b])); }} />
          <span>{t('rm_on')}</span>
        </label>
      )}
      {std && R ? <p className="note">{t('rm_pulley_std', { H: String(R.H), W: String(R.doorW), D: String(R.doorH) })}</p> : null}
      {R ? <RoomFields R={R} put={put} machine={pulley ? undefined : machine} blank={(k) => keys([k]).some(blank.is)} choose={tb('choose')} panel={panel} pulley={!!pulley} /> : null}
    </details>
  );
}
