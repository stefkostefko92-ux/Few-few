'use client';

// The end of the sheet's form, «Stampa e PDF» (rilievi form.ejs #s-riepilogo, commit 988f3cf37): what goes into the
// sheet's print and PDF. First the sections, in the company's order without «Impianto» (it is always in the head and the
// plate), each ticked unless the sheet leaves it out — the server stores the ones left out (`sezioniEscluse`), so a
// section added later comes in by itself; a section with a condition hides here too while it is hidden (its tick stays as
// it is and is sent: a hidden section is not left out). The hidden mark `stampa-_` says the list is in the form (a page
// without it — every section). Then what is filled in the modules, one tick per module (the panel's order, the argano
// sheet, 2SG's sheet), none at first; only what is filled in comes in. The keys and their check: stampa.ts. Each list has
// its «?» in its legend (round 52, legenda.tsx).
import { testoAiuto } from '@/lib/aiuto';
import type { FieldErrors, FormValues } from '@/lib/rilievi/field-parsers';
import { tokensOf, type SectionDef, type SectionKey } from '@/lib/rilievi/fields';
import { errorTextOf, RIEPILOGO_KEY, STAMPA_KEY, STAMPA_MARK } from '@/lib/rilievi/form-help';
import { FISSE } from '@/lib/rilievi/ordine';
import type { RilieviT } from '@/lib/rilievi/t';
import AIUTO from '../../../messages/aiuto/rilievi.json';
import { Tick } from './FieldInput';
import { legenda } from './legenda';
import { whenAttrs } from './when';

export default function StampaScelta({ sections, shown, colonne, values, errors, t }: {
  /** the form's sections in the company's order */
  sections: readonly SectionDef[];
  /** the sections shown at the opening (activeParts) */
  shown: ReadonlySet<SectionKey>;
  /** the modules' columns, in the order of the registry (ordineQuadro, preventivoArgano, ordineSospensioni) */
  colonne: readonly string[];
  values: FormValues;
  errors: FieldErrors;
  t: RilieviT;
}) {
  // a single tick comes back from the browser as a string (the form brought back after a refusal): as a list
  const stampa = tokensOf(values[STAMPA_KEY]);
  const moduli = tokensOf(values[RIEPILOGO_KEY]);
  const errStampa = errors[STAMPA_KEY], errModuli = errors[RIEPILOGO_KEY];
  const nomeSezioni = legenda('nm-stampa', t('riepilogo.sezioni'), testoAiuto(AIUTO, 'stampa'));
  const nomeModuli = legenda('nm-riepilogoOrdini', t('riepilogo.moduli'), testoAiuto(AIUTO, 'riepilogoOrdini'));
  return (
    <fieldset className="rv-section" id="s-riepilogo">
      <legend>{t('riepilogo.title')}</legend>
      <div className="rv-grid">
        <fieldset className="rv-choice rv-wide" id={`f-${STAMPA_KEY}`} aria-labelledby={nomeSezioni.labelledBy}
          aria-describedby={errStampa ? 'stampa-hint err-stampa' : 'stampa-hint'}>
          <legend>{nomeSezioni.testo}</legend>
          <input type="hidden" name={STAMPA_MARK} value="1" />
          <div className="rv-opts">
            {sections.filter((s) => !FISSE.includes(s.key)).map((s) => (
              <Tick key={s.key} type="checkbox" name={STAMPA_KEY} value={s.key} checked={stampa.includes(s.key)} label={t(`scheda.section.${s.key}`)}
                cond={whenAttrs(s.when, !shown.has(s.key))} />
            ))}
          </div>
          <p className="rv-hint" id="stampa-hint">{t('riepilogo.sezioniHint')}</p>
          {errStampa ? <p className="rv-error" id="err-stampa">{errorTextOf(STAMPA_KEY, errStampa, t)}</p> : null}
        </fieldset>
        <fieldset className="rv-choice rv-wide" id={`f-${RIEPILOGO_KEY}`} aria-labelledby={nomeModuli.labelledBy}
          aria-describedby={errModuli ? 'riepilogo-hint err-riepilogoOrdini' : 'riepilogo-hint'}>
          <legend>{nomeModuli.testo}</legend>
          <div className="rv-opts">
            {colonne.map((col) => (
              <Tick key={col} type="checkbox" name={RIEPILOGO_KEY} value={col} checked={moduli.includes(col)} label={t(`riepilogo.modulo.${col}`)} />
            ))}
          </div>
          <p className="rv-hint" id="riepilogo-hint">{t('riepilogo.hint')}</p>
          {errModuli ? <p className="rv-error" id="err-riepilogoOrdini">{errorTextOf(RIEPILOGO_KEY, errModuli, t)}</p> : null}
        </fieldset>
      </div>
    </fieldset>
  );
}
