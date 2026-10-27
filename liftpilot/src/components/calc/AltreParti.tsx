'use client';

// «Altre parti (facoltative)» of a modernisation (round 46, B7, owner's decision Q3): the safety gear, the ACOP and UCM
// protections, the emergency alarm, the machine room and — with the car doors replaced — the car doors made sliding.
// Each is a pair of native radio buttons with «No» checked until «Sì» is chosen: never in the list of what is missing,
// and the renovation with the existing sling does not answer them (src/lib/lift/risposte.ts facoltativeDi). Round 52:
// each part with its «?» (messages/aiuto/calcolo.json), its name still the radio group's.
import { useTranslations } from 'next-intl';
import { testoAiuto } from '@/lib/aiuto';
import { parteId } from '@/lib/calc-blank';
import type { Collaudo, Parte } from '@/lib/lift';
import AIUTO from '../../../messages/aiuto/calcolo.json';
import { ConAiuto } from '../shaft/Campo';

interface Props {
  /** the optional parts shown (facoltativeDi) */
  parti: readonly Parte[];
  chosen: Collaudo;
  answer(p: Parte, si: boolean): void;
}

export default function AltreParti({ parti, chosen, answer }: Props) {
  const t = useTranslations('calculations.intervento'), tl = useTranslations('lift');
  if (!parti.length) return null;
  return (
    <fieldset className="parti-altre">
      <legend>{t('altre_title')}</legend>
      <p className="note">{t('altre_lead')}</p>
      <ul className="parti-list">
        {parti.map((p) => {
          const si = chosen.parti.includes(p);
          return (
            <li key={p} className={`parte${si ? ' si' : ''}`} data-part={p}>
              <ConAiuto aiuto={testoAiuto(AIUTO, `parte_${p}`)} nome={tl(`parte_${p}`)} className="parte-lbl">
                <span className="parte-nome" id={`${parteId(p)}-label`}>{tl(`parte_${p}`)}</span>
              </ConAiuto>
              <span className="seg-row parte-scelta" role="radiogroup" aria-labelledby={`${parteId(p)}-label`}>
                {([true, false] as const).map((x) => (
                  <label key={String(x)} className={si === x ? 'on' : undefined}>
                    <input type="radio" name={parteId(p)} value={x ? 'si' : 'no'} checked={si === x} onChange={() => answer(p, x)} />
                    {t(x ? 'si' : 'no')}
                  </label>
                ))}
              </span>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
