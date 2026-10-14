'use client';

// What the type of intervention and its parts call for, in our words with the clause numbers — warnings, never a
// refusal (owner's decision Q2: point 21.1 warns and offers the transformation, it does not force it): controller,
// machine, landing doors, car and sling replaced together (UNI 10411-1/-11, 21.1); new landing doors in an activity
// under fire controls (DM 15/09/2005, art. 1 c.2); a new car that stays accessible (UNI 10411-1, 21.2 and 22 j)); a
// «Solo argano» whose loads change from the documented ones (6.1); the transformation in an existing building
// (UNI EN 81-21). The engineer and the organismo confirm the procedure: nothing here states its conformity.
import { useTranslations } from 'next-intl';
import { sostanziale, type Collaudo, type TipoIntervento } from '@/lib/lift';

interface Props {
  tipo: TipoIntervento;
  /** the test as the documents read it */
  value: Collaudo;
  /** «Passa a Trasformazione completa» (point 21.1) */
  passa(): void;
}

export default function AvvisiIntervento({ tipo, value, passa }: Props) {
  const t = useTranslations('calculations.intervento');
  const has = (p: Collaudo['parti'][number]): boolean => value.parti.includes(p);
  const avvisi: { key: string; azione?: boolean }[] = [];
  if (tipo === 'SOLO_ARGANO' && has('load')) avvisi.push({ key: 'avviso_carichi_solo' });
  if (tipo === 'AMMODERNAMENTO') {
    if (sostanziale(value)) avvisi.push({ key: 'avviso_21_1', azione: true });
    if (has('landingDoors')) avvisi.push({ key: 'avviso_porte_fuoco' });
    if (has('car')) avvisi.push({ key: 'avviso_cabina_70' });
  }
  return (
    <>
      {avvisi.length ? (
        <ul className="intervento-avvisi" aria-live="polite">
          {avvisi.map((a) => (
            <li key={a.key} className={a.azione ? 'forte' : undefined} data-avviso={a.key}>
              <p>{t(a.key)}</p>
              {a.azione ? <button type="button" className="btn btn-sm" onClick={passa}>{t('passa')}</button> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {tipo === 'TRASFORMAZIONE_COMPLETA' ? <p className="note intervento-hint">{t('hint_en81_21')}</p> : null}
    </>
  );
}
