'use client';

// The Progetto's form, on the left of its screen (round 45): what it draws on («Calcolo argano», read only), then the
// geometry only — the shaft (its size, or measured on a drawing), entrances, doors and counterweight (the rated load the
// calculation's), the floors with pit and headroom (the speed the calculation's), the machine room (with a machine
// below and its pulleys over the slab, the pulley room) and the ropes in the drawing (ProgettoFuni). The intervention,
// the test, the machine and the calculation's values are changed in «Calcolo argano». A new drawing starts empty
// (blankProgetto); the software's own values (rails, allowances, heights, niches, frames…) come once its data are in.
import { useTranslations } from 'next-intl';
import SectionTitle from '@/components/project/SectionTitle';
import { KL, type BottomScheme, type LiftDerived, type LiftInputs } from '@/lib/lift';
import type { ProgettoAuto } from '@/lib/lift/progetto';
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
import DalCalcolo, { type BaseProgetto } from './DalCalcolo';
import ProgettoFuni from './ProgettoFuni';

interface Props {
  P: Pres;
  X: Texts;
  /** the one form's inputs composed on the base (the drawing and the calculation's values) */
  inp: LiftInputs;
  base: BaseProgetto;
  projectId: string;
  /** the base's date as the page writes it */
  when: string;
  canCalc: boolean;
  /** the drawing's own height of the diverting pulley set on the plan [m] */
  h: number | undefined;
  /** what the software worked out; null while the drawing's data are still to enter */
  derived: LiftDerived | null;
  blank: FormBlank;
  texts: BlankTexts;
  /** the drawing the shaft was measured on; null: entered by hand */
  source: ShaftSource | null;
  setShaft: ShaftSet;
  /** the shaft's inner size typed [mm] */
  setSize(key: 'W' | 'D', value: number): void;
  onSurvey(r: SurveyResult): void;
  setAuto(patch: Partial<ProgettoAuto>): void;
  setBottom(b: BottomScheme): void;
  /** «Porta nel calcolo» beside an issue the calculation resolves (the falls, the diverting pulley); null: not for this
   *  user (or the standalone page) */
  porta: { go(): void; pending: boolean } | null;
}

export default function ProgettoForm({ P, X, inp, base, projectId, when, canCalc, h, derived, blank, texts, source, setShaft, setSize, onSurvey, setAuto, setBottom, porta }: Props) {
  const t = useTranslations('lift'), ts = useTranslations('shaft'), tp = useTranslations('progetto'), is = blank.is;
  // the machine room comes with a machine above; the pulley room with a machine below whose pulleys stand over the slab
  // (scheme room): the room the sheets and the 3D draw and the checks measure
  const above = inp.calc.layout !== 'bottom';
  const pulley = inp.calc.layout === 'bottom' && !is('bottom') && inp.bottom === 'room'
    ? { standard: pulleyRoomOf({ ...inp.shaft, room: null }), minH: KV_VERT.pulleyRoomH, doorW: KV_VERT.doorMinW, doorH: KV_VERT.pulleyDoorH, above: KV_VERT.pulleyAbove } : undefined;
  const size = (key: 'W' | 'D') => (
    <label className={`field${is(key) ? ' need' : ''}`}>
      <span>{ts(key)}</span>
      <input id={fieldId(key)} className="input num" type="number" inputMode="numeric" min={500} max={10000} step={10} value={is(key) ? '' : inp.shaft[key]}
        aria-required={is(key) || undefined} onChange={(e) => { const v = mmOf(e.target.value); if (v !== null) setSize(key, v); }} />
    </label>
  );
  const fromCalc = tp('fromCalc');
  return (
    <form className="lift-form panel" autoComplete="off" noValidate onSubmit={(e) => e.preventDefault()}>
      <DalCalcolo P={P} X={X} base={base} projectId={projectId} when={when} canCalc={canCalc} />
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
      <ShaftOptions I={inp.shaft} set={setShaft} blank={blank} fixedQ={{ kg: inp.shaft.Q ?? 0, label: fromCalc }} />
      {base.collaudo.aggiuntive?.includes('dm236') ? <p className="note">{tp('dm236')}</p> : null}
      {blank.full ? (
        <>
          <ShaftTechOptions I={inp.shaft} set={setShaft} govSide={derived && !inp.shaft.governorSide ? derived.shaft.governorSide : undefined} />
          <NicheOptions I={inp.shaft} set={setShaft} />
          <HeadOptions I={inp.shaft} set={setShaft} />
          <FrameOptions I={inp.shaft} set={setShaft} />
          <ImbottiOptions I={inp.shaft} set={setShaft} />
        </>
      ) : null}
      <SectionTitle icon="layers">{t('s_floors')}</SectionTitle>
      <VerticalOptions I={inp.shaft} set={setShaft} open blank={blank} fixedV={{ ms: inp.shaft.vertical.v, label: fromCalc }} />
      {above ? (
        <RoomOptions I={inp.shaft} set={setShaft} blank={blank}
          machine={derived ? { D: derived.machine.D, shimsAxis: KL.sheaveAxisPerD * derived.machine.D, shape: derived.machine.shape ?? null, rinvio: derived.machine.rinvio ?? null, heb: derived.heb, turn: roomGeo(derived.layout, derived.machine)?.dir } : undefined}
          panel={{ auto: !!inp.auto.panel, set: (on) => setAuto({ panel: on }), placed: derived && derived.origin.panel === 'auto' ? derived.shaft.room : null }} />
      ) : pulley ? <RoomOptions I={inp.shaft} set={setShaft} blank={blank} pulley={pulley} /> : null}
      <SectionTitle icon="gear">{t('s_funi')}</SectionTitle>
      <ProgettoFuni P={P} base={base.values} auto={inp.auto} bottom={inp.bottom} h={h} derived={derived} blank={blank} texts={texts} setAuto={setAuto} setBottom={setBottom}
        t={(k, v) => t(k, v)} porta={porta ? { ...porta, label: tp('porta') } : null} />
    </form>
  );
}
