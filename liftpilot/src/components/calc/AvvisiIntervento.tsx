'use client';

// What the type of intervention and its parts call for, in our words with the clause numbers — warnings, never a
// refusal (owner's decision Q2: point 21.1 warns and offers the transformation, it does not force it): controller,
// machine, landing doors, car and sling replaced together (UNI 10411-1/-11, 21.1); new landing doors in an activity
// under fire controls (DM 15/09/2005, art. 1 c.2, or the fire code's RTV V.3 where it applies); a new car that stays
// accessible — in a substantial modification (UNI 10411-1/-11, 21.2), or on the existing sling under UNI 10411-1 (22 j),
// the landing controls too when the landing doors are new; UNI 10411-11 has no such point outside 21; a «Solo argano»
// whose loads change from the documented ones (6.1); the transformation in an existing building (UNI EN 81-21). Round
// 46: a «Solo argano» whose speed or travel the logbook counts as changed (15, 16 — the save refuses it, «Passa ad
// Ammodernamento»); the travel over 8 m from the first test under UNI 10411-1 (16: a new installation — «Passa a
// Trasformazione completa», never forced, owner's decision Q2); a change of speed over 5 % under -11 (15 i), UCM); a
// change of speed within 5 % under -1 (information); a «Solo argano» whose new machine stays on a controller of one or
// two speeds (UNI 10411-1 11.2.1, -11 11.2 — the save refuses it, «Passa ad Ammodernamento con il quadro», owner's
// decision Q1). The engineer and the organismo confirm the procedure: nothing here states its conformity. «Passa a …»
// takes the focus to the type chosen (the button goes with its warning).
import { useTranslations } from 'next-intl';
import type { FormValues } from '@/calc/types';
import { sostanziale, type Collaudo, type TipoIntervento } from '@/lib/lift';
import { regolazioneChiesta, senzaRegolazione } from '@/lib/lift/intervento';
import { corsaOf, variazioneCorsa, variazioneVelocita, velocitaOf } from '@/lib/lift/modifica';

interface Props {
  tipo: TipoIntervento;
  /** the test as the documents read it */
  value: Collaudo;
  /** the calculation's values (the design's speed and travel against the logbook's) */
  V: FormValues;
  /** «Passa a …»: the type a warning offers (`quadro`: with the controller «Sì») */
  passa(t: TipoIntervento, quadro?: boolean): void;
}

export default function AvvisiIntervento({ tipo, value, V, passa }: Props) {
  const t = useTranslations('calculations.intervento');
  const has = (p: Collaudo['parti'][number]): boolean => value.parti.includes(p);
  const avvisi: { key: string; azione?: TipoIntervento; quadro?: true }[] = [];
  const norma = value.norma === '10411-1' || value.norma === '10411-11' ? value.norma : null, lib = value.libretto;
  const v = norma && lib && (lib.v || lib.v50) ? velocitaOf(V) : null, H = norma && lib?.H ? corsaOf(V) : null;
  const xv = norma && v !== null ? variazioneVelocita(norma, lib, v) : null, xh = norma && H !== null ? variazioneCorsa(norma, lib, H) : null;
  // one way to the modernisation: with the controller when the existing one has no speed regulation
  const inverter = tipo === 'SOLO_ARGANO' && regolazioneChiesta(tipo, value) && senzaRegolazione(value.regolazione);
  if (tipo === 'SOLO_ARGANO' && has('load')) avvisi.push({ key: 'avviso_carichi_solo' });
  if (inverter) avvisi.push({ key: 'avviso_inverter', azione: 'AMMODERNAMENTO', quadro: true });
  if (tipo === 'SOLO_ARGANO' && has('speed')) avvisi.push({ key: 'avviso_velocita_solo', ...(inverter ? {} : { azione: 'AMMODERNAMENTO' as const }) });
  if (tipo === 'SOLO_ARGANO' && has('travel')) avvisi.push({ key: 'avviso_corsa_solo', ...(has('speed') || inverter ? {} : { azione: 'AMMODERNAMENTO' as const }) });
  if (tipo === 'AMMODERNAMENTO') {
    const sost = sostanziale(value);
    if (sost) avvisi.push({ key: 'avviso_21_1', azione: 'TRASFORMAZIONE_COMPLETA' });
    if (has('landingDoors')) avvisi.push({ key: 'avviso_porte_fuoco' });
    if (sost) avvisi.push({ key: 'avviso_cabina_70_21' });
    else if (has('car') && !has('sling') && value.norma === '10411-1') avvisi.push({ key: has('landingDoors') ? 'avviso_cabina_70_piani' : 'avviso_cabina_70' });
  }
  if (tipo !== 'TRASFORMAZIONE_COMPLETA') {
    if (xh?.oltre8) avvisi.push({ key: 'avviso_corsa_8m', ...(avvisi.some((a) => a.azione === 'TRASFORMAZIONE_COMPLETA') ? {} : { azione: 'TRASFORMAZIONE_COMPLETA' as const }) });
    if (xv?.ucm15i) avvisi.push({ key: 'avviso_ucm_15i' });
    if (norma === '10411-1' && xv && !xv.variata && Math.abs(xv.dv) > 0.0005) avvisi.push({ key: 'avviso_velocita_entro5' });
  }
  const passaTo = (to: TipoIntervento, quadro = false): void => {
    passa(to, quadro);
    // the button goes with its warning: the focus stays on the type now chosen, not on the page
    requestAnimationFrame(() => document.querySelector<HTMLInputElement>(`input[name="intervento"][value="${to}"]`)?.focus());
  };
  return (
    <>
      {avvisi.length ? (
        <ul className="intervento-avvisi" aria-live="polite">
          {avvisi.map((a) => (
            <li key={a.key} className={a.azione ? 'forte' : undefined} data-avviso={a.key}>
              <p>{t(a.key, { norma: value.norma })}</p>
              {a.azione ? <button type="button" className="btn btn-sm" onClick={() => passaTo(a.azione as TipoIntervento, a.quadro === true)}>
                {t(a.quadro ? 'passa_quadro' : a.azione === 'AMMODERNAMENTO' ? 'passa_ammodernamento' : 'passa')}</button> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {tipo === 'TRASFORMAZIONE_COMPLETA' ? <p className="note intervento-hint">{t('hint_en81_21')}</p> : null}
    </>
  );
}
