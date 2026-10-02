'use client';

// The machine room over the shaft: whether the design has one, and its fields (RoomFields). It is drawn in plan and in
// section B-B and checked (height, free area in front of the panel, door, beams).
import { useTranslations } from 'next-intl';
import { DEFAULT_ROOM, type RoomInputs, type ShaftInputs } from '@/shaft';
import RoomFields, { type RoomMachine } from './RoomFields';

interface Props {
  I: ShaftInputs;
  set(patch: Partial<ShaftInputs>): void;
  /** unfolded at first (the one form of an installation) */
  open?: boolean;
  /** the machine (its sheave, the axis on shims, where its pulley turns): the support's fields; missing: none shown */
  machine?: RoomMachine;
}

export default function RoomOptions({ I, set, open = false, machine }: Props) {
  const t = useTranslations('shaft'), R = I.room;
  const put = (patch: Partial<RoomInputs>): void => { if (R) set({ room: { ...R, ...patch } }); };
  return (
    <details className="room-options" open={open}>
      <summary>{t('rm_title')}</summary>
      <label className="check">
        <input type="checkbox" checked={R !== null} onChange={(e) => set({ room: e.target.checked ? DEFAULT_ROOM : null })} />
        <span>{t('rm_on')}</span>
      </label>
      {R ? <RoomFields R={R} put={put} machine={machine} /> : null}
    </details>
  );
}
