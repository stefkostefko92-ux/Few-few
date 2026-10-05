'use client';

// The machine room over the shaft: whether the design has one, and its fields (RoomFields). It is drawn in plan and in
// section B-B and checked (height, free area in front of the panel, door, beams). A room added starts with every
// measure to enter (src/lib/lift/blank.ts).
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { RoomInputs, ShaftInputs } from '@/shaft';
import { ROOM_FIELDS, ROOM_PLACEHOLDER, filled, isBlankKey, roomAdded, type BlankKey } from '@/lib/lift/blank';
import { NO_BLANK, type FormBlank, type ShaftSet } from '../blank';
import RoomFields, { type RoomMachine } from './RoomFields';

interface Props {
  I: ShaftInputs;
  set: ShaftSet;
  /** unfolded at first (else only with measures to enter) */
  open?: boolean;
  /** the machine (its sheave, the axis on shims, where its pulley turns): the support's fields; missing: none shown */
  machine?: RoomMachine;
  blank?: FormBlank;
}

export default function RoomOptions({ I, set, open = false, machine, blank = NO_BLANK }: Props) {
  const t = useTranslations('shaft'), tb = useTranslations('blank'), R = I.room;
  // unfolded when it comes with measures to enter; then as the user leaves it
  const [unfolded] = useState(() => open || (R !== null && ROOM_FIELDS.some((k) => blank.is(`room.${k}`))));
  // the measures entered (the ridge of a flat roof and the support are no project data to enter)
  const keys = (entered: readonly string[]): BlankKey[] => entered.map((k) => `room.${k}`).filter(isBlankKey);
  const put = (patch: Partial<RoomInputs>, entered: readonly (keyof RoomInputs)[] = []): void => {
    if (R) set({ room: { ...R, ...patch } }, (b) => filled(b, keys(entered)));
  };
  return (
    <details className="room-options" open={unfolded || undefined}>
      <summary>{t('rm_title')}</summary>
      <label className="check">
        <input type="checkbox" checked={R !== null} onChange={(e) => { const on = e.target.checked; set({ room: on ? ROOM_PLACEHOLDER : null }, (b) => (on ? roomAdded(b) : [...b])); }} />
        <span>{t('rm_on')}</span>
      </label>
      {R ? <RoomFields R={R} put={put} machine={machine} blank={(k) => keys([k]).some(blank.is)} choose={tb('choose')} /> : null}
    </details>
  );
}
