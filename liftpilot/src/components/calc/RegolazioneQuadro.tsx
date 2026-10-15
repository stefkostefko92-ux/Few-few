'use client';

// The speed regulation of the existing controller under a new machine (round 46, B6; UNI 10411-1:2024 11.2.1, UNI
// 10411-11:2024 11.2): asked in «Calcolo argano» under the ropes of a «Solo argano» and under the controller's row of a
// modernisation (machine «Sì», controller «No»). Three native radio buttons of one group — VVVF, two speeds, one speed —,
// none checked until it is answered; unanswered it is in the list of what is missing (its first answer carries the id
// the list links to). The software sizes every machine it proposes for a frequency converter: one or two speeds replace
// the controller in a modernisation (the controller's row locked «Sì») and refuse a «Solo argano» («Passa ad
// Ammodernamento con il quadro», AvvisiIntervento).
import { useTranslations } from 'next-intl';
import { REGOLAZIONE_ID } from '@/lib/calc-blank';
import { REGOLAZIONI, type Regolazione } from '@/lib/lift/modifica';

interface Props {
  value: Regolazione | undefined;
  set(r: Regolazione): void;
  /** the part of UNI 10411 of the test (its clause in the hint) */
  norma: '10411-1' | '10411-11';
}

export default function RegolazioneQuadro({ value, set, norma }: Props) {
  const t = useTranslations('calculations.intervento');
  const hintId = `${REGOLAZIONE_ID}-hint`;
  return (
    <li className={`parte regola${value ? '' : ' da'}`} data-part="regolazione">
      <span className="parte-nome" id={`${REGOLAZIONE_ID}-label`}>{t('reg_domanda')}</span>
      <span className="seg-row parte-scelta" role="radiogroup" aria-labelledby={`${REGOLAZIONE_ID}-label`} aria-describedby={hintId}>
        {REGOLAZIONI.map((r, i) => (
          <label key={r} className={value === r ? 'on' : undefined}>
            <input type="radio" name={REGOLAZIONE_ID} id={i === 0 ? REGOLAZIONE_ID : undefined} value={r} checked={value === r} onChange={() => set(r)} />
            {t(`reg_${r}`)}
          </label>
        ))}
      </span>
      {!value ? <span className="parte-da">{t('da')}</span> : null}
      <span className="parte-perche" id={hintId}>{t('reg_hint', { clausola: norma === '10411-1' ? 'UNI 10411-1, 11.2.1' : 'UNI 10411-11, 11.2' })}</span>
    </li>
  );
}
