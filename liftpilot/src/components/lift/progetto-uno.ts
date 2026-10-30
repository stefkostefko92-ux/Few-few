'use client';

// The Progetto's form one step at a time (round 53, «Semplice»; «Esperto» and the standalone page show every step): the
// step shown — at first the one still needing something, then the one chosen in the bar, by a link to a value of it
// (passi/mostra.ts) or with «Avanti»/«Indietro» —, never changed by typing; after the last step of the form, «Avanti»
// opens the checks on the right side.
import { useEffect, useRef, useState } from 'react';
import { passoOra, type Passo } from '@/lib/passi';
import { passoId } from '@/lib/passi-moduli';
import { useModalita } from '../shell/Modalita';
import { chiediPasso, suPasso } from '../passi/mostra';
import type { Uno } from './ProgettoForm';

export function useUnoAllaVolta(passi: readonly Passo[]): Uno | null {
  const semplice = useModalita()?.modalita === 'semplice';
  const form = passi.filter((p) => p.id !== passoId('verifiche')), verifiche = passi.find((p) => p.id === passoId('verifiche')) ?? null;
  const [scelto, setScelto] = useState<string | null>(() => (passoOra(form) ?? form[0])?.id ?? null);
  const ids = form.map((p) => p.id).join(' ');
  useEffect(() => suPasso((id) => { if (ids.split(' ').includes(id)) setScelto(id); }), [ids]);
  // a step that is gone (the machine room of a machine moved below): the first
  const attivo = form.some((p) => p.id === scelto) ? scelto : form[0]?.id ?? null;
  // moved with «Avanti»/«Indietro»: the step's title in view
  const salta = useRef(false);
  useEffect(() => {
    if (!salta.current || !attivo) return;
    salta.current = false;
    document.getElementById(attivo)?.scrollIntoView({ block: 'start' });
  }, [attivo]);
  if (!semplice || !attivo) return null;
  const i = form.findIndex((p) => p.id === attivo);
  const prima = i > 0 ? form[i - 1] : null, dopo = i < form.length - 1 ? form[i + 1] : verifiche;
  const vai = (id: string): void => {
    if (form.some((p) => p.id === id)) {
      salta.current = true;
      setScelto(id);
      return;
    }
    chiediPasso(id);
    document.getElementById(id)?.scrollIntoView({ block: 'start' });
  };
  return { attivo, prima: prima && { id: prima.id, label: prima.label }, dopo: dopo && { id: dopo.id, label: dopo.label }, vai };
}
