'use client';

// The one form of an installation, on the left of its screen: the intervention (the machine replaced, the lift renewed
// keeping its existing sling, a new lift: src/lib/lift/intervento.ts) and its test, the shaft (its size, or measured on a
// drawing), the load, doors and counterweight, the floors with pit and headroom, the machine room (with a machine below
// and its pulleys over the slab, the pulley room), the lift and its machine. A new installation starts empty (src/lib/lift/blank.ts); the software's own values (rails,
// allowances, heights, niches, frames…) come once the project's data are in.
import { useTranslations } from 'next-intl';
import SectionTitle from '@/components/project/SectionTitle';
import type { FormValues } from '@/calc/types';
import { INTERVENTI, KL, collaudoOf, interventoOf, interventoTo, type AutoFlags, type BottomScheme, type Collaudo, type Intervento, type LiftDerived,
  type LiftInputs } from '@/lib/lift';
import type { CatalogChoice } from '@/lib/lift/catalog';
import { pulleyRoomOf } from '@/lib/lift/shaft-rig';
import { roomGeo } from '@/shaft/machine-room';
import { KV_VERT } from '@/shaft/norme-vert';
import type { Texts } from '@/lib/present/texts';
import type { Pres } from '@/lib/present/tr';
import type { ShaftSource } from '@/lib/shaft-input';
import type { BlankTexts } from '../calc/FieldRow';
import { fieldId, mmOf, type FormBlank, type ShaftSet } from '../blank';
import ShaftOptions from '../shaft/ShaftOptions';
import ShaftTechOptions from '../shaft/ShaftTechOptions';
import VerticalOptions from '../shaft/VerticalOptions';
import RoomOptions from '../shaft/RoomOptions';
import HeadOptions from '../shaft/HeadOptions';
import FrameOptions from '../shaft/FrameOptions';
import ImbottiOptions from '../shaft/ImbottiOptions';
import NicheOptions from '../shaft/NicheOptions';
import SurveyPanel, { type SurveyResult } from '../shaft/SurveyPanel';
import CollaudoOptions from './CollaudoOptions';
import LiftCalcFields from './LiftCalcFields';

interface Props {
  P: Pres;
  X: Texts;
  inp: LiftInputs;
  /** what the software worked out; null while the project's data are still to enter */
  derived: LiftDerived | null;
  /** the new machine is in too (proposed or entered): what depends on it is shown */
  complete: boolean;
  blank: FormBlank;
  bad: ReadonlySet<string>;
  /** the calculation's values still to enter */
  need: ReadonlySet<string>;
  texts: BlankTexts;
  /** the drawing the shaft was measured on; null: entered by hand */
  source: ShaftSource | null;
  setShaft: ShaftSet;
  /** the shaft's inner size typed [mm] */
  setSize(key: 'W' | 'D', value: number): void;
  onSurvey(r: SurveyResult): void;
  setCalc(patch: FormValues): void;
  setAuto(patch: Partial<AutoFlags>): void;
  setBottom(b: BottomScheme): void;
  setCollaudo(c: Collaudo): void;
  setCatalog(c: CatalogChoice | undefined): void;
}

export default function LiftForm({ P, X, inp, derived, complete, blank, bad, need, texts, source, setShaft, setSize, onSurvey, setCalc, setAuto, setBottom, setCollaudo, setCatalog }: Props) {
  const t = useTranslations('lift'), ts = useTranslations('shaft'), is = blank.is;
  const intervento = interventoOf(inp.calc, inp.collaudo);
  const pick = (k: Intervento): void => {
    const r = interventoTo(k, inp.collaudo);
    setCalc(r.calc);
    if (r.collaudo) setCollaudo(r.collaudo);
  };
  // the machine room comes with a machine above (once its place is chosen); the pulley room with a machine below whose
  // pulleys stand over the slab (scheme room): the room the sheets and the 3D draw and the checks measure
  const above = !is('layout') && inp.calc.layout !== 'bottom';
  const pulley = !is('layout') && inp.calc.layout === 'bottom' && !is('bottom') && inp.bottom === 'room'
    ? { standard: pulleyRoomOf({ ...inp.shaft, room: null }), minH: KV_VERT.pulleyRoomH, doorW: KV_VERT.doorMinW, doorH: KV_VERT.pulleyDoorH, above: KV_VERT.pulleyAbove } : undefined;
  const size = (key: 'W' | 'D') => (
    <label className={`field${is(key) ? ' need' : ''}`}>
      <span>{ts(key)}</span>
      <input id={fieldId(key)} className="input num" type="number" inputMode="numeric" min={500} max={10000} step={10} value={is(key) ? '' : inp.shaft[key]}
        aria-required={is(key) || undefined} onChange={(e) => { const v = mmOf(e.target.value); if (v !== null) setSize(key, v); }} />
    </label>
  );
  return (
    <form className="lift-form panel" autoComplete="off" noValidate onSubmit={(e) => e.preventDefault()}>
      <SectionTitle icon="clipboard-list">{t('s_context')}</SectionTitle>
      <div className="seg-row" role="radiogroup" aria-label={t('s_context')}>
        {INTERVENTI.map((k) => (
          <button key={k} type="button" role="radio" aria-checked={intervento === k} className={intervento === k ? 'on' : undefined} onClick={() => pick(k)}>{t(`context_${k}`)}</button>
        ))}
      </div>
      {/* the test as chosen now (the derivation is deferred: its collaudo would lag a render behind a click); the design's
          loads, once worked out, against the documented ones; DM 236 ticked with no case chosen yet sets the usual one */}
      <CollaudoOptions P={P} isNew={intervento === 'new'} chosen={inp.collaudo} set={setCollaudo}
        value={collaudoOf(derived ? { ...derived.values, context: inp.calc.context } : inp.calc, inp.collaudo)}
        access={{ value: is('access') ? 'none' : inp.shaft.access, set: (access) => setShaft({ access }) }} calc={derived?.values} />
      <SectionTitle icon="building">{t('s_shaft')}</SectionTitle>
      <div className="form-grid">
        {size('W')}
        {size('D')}
      </div>
      <details className="survey">
        <summary>{t('from_cad')}</summary>
        <SurveyPanel onSurvey={onSurvey} />
      </details>
      <p className="note">{source ? ts('sourceCad', { file: source.file, format: source.format.toUpperCase() }) : ts('edited')}</p>
      <ShaftOptions I={inp.shaft} set={setShaft} blank={blank} />
      {blank.full ? (
        <>
          <ShaftTechOptions I={inp.shaft} set={setShaft} govSide={derived && complete && !inp.shaft.governorSide ? derived.shaft.governorSide : undefined} />
          <NicheOptions I={inp.shaft} set={setShaft} />
          <HeadOptions I={inp.shaft} set={setShaft} />
          <FrameOptions I={inp.shaft} set={setShaft} />
          <ImbottiOptions I={inp.shaft} set={setShaft} />
        </>
      ) : null}
      <SectionTitle icon="layers">{t('s_floors')}</SectionTitle>
      <VerticalOptions I={inp.shaft} set={setShaft} open blank={blank} />
      {above ? (
        <RoomOptions I={inp.shaft} set={setShaft} blank={blank}
          machine={derived && complete ? { D: derived.machine.D, shimsAxis: KL.sheaveAxisPerD * derived.machine.D, shape: derived.machine.shape ?? null, rinvio: derived.machine.rinvio ?? null, heb: derived.heb, turn: roomGeo(derived.layout, derived.machine)?.dir } : undefined}
          panel={{ auto: !!inp.auto.panel, set: (on) => setAuto({ panel: on }), placed: derived && complete && derived.origin.panel === 'auto' ? derived.shaft.room : null }} />
      ) : pulley ? <RoomOptions I={inp.shaft} set={setShaft} blank={blank} pulley={pulley} /> : null}
      <SectionTitle icon="gear">{t('s_drive')}</SectionTitle>
      <LiftCalcFields P={P} X={X} inp={inp} derived={derived} complete={complete} bad={bad} need={need} blank={blank} texts={texts} setCalc={setCalc} setAuto={setAuto} setBottom={setBottom}
        setCatalog={setCatalog} t={(k, v) => t(k, v)} />
    </form>
  );
}
