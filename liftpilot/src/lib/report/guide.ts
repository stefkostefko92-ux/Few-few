// The section «Guide e carichi sulle strutture» of the relazione di calcolo of a lift design (Italian): the car rails'
// check by UNI EN 81-50:2020, 5.10 and the loads on the building by UNI EN 81-20:2020, 5.2.1.8, from the same
// computation as sheet 1 of the drawing set (src/lib/tavole/sheet-loads.ts) with the data of the installation — the
// relazione the engineer signs carries the numbers, not only the sheet. Pure.
import appIt from '../../../messages/it.json';
import type { CheckStatus } from '@/calc/types';
import { KV_VERT } from '@/shaft/norme-vert';
import { KV_GUIDE } from '@/shaft/norme-guide';
import type { MachineSpec } from '@/shaft/machine-room';
import { railLabel } from '@/shaft/rails';
import type { Layout, ShaftCheck } from '@/shaft/types';
import { ropeLength } from '../lift/support';
import type { Plant } from '../plant';
import type { Analysis } from '../present/analysis';
import { railChecks, railLimits } from '../tavole/rail-check';
import type { SafetyGear } from '../tavole/forces';
import { sheetLoads, sheetRails, supportRows } from '../tavole/sheet-loads';
import type { BlockStatus, ReportBlock } from './model';

type Fmt = (x: number, dec?: number) => string;

const GEAR_IT = { progressive: 'progressivo', roller: 'istantaneo a rulli', instantaneous: 'istantaneo' } as const;

/** The rails' checks with the data of the installation (the result of the relazione takes them) and the section. */
export function guideSection(a: Analysis, L: Layout, Pl: Plant, M: MachineSpec, made: { brand: string; model: string } | null, fmt: Fmt,
  st: (s: CheckStatus) => string, esito: (c: ShaftCheck) => { text: string; status: BlockStatus }, cwGear: SafetyGear | null = null): { checks: ShaftCheck[]; blocks: ReportBlock[] } {
  const { I, N } = a.ctx, R = sheetRails(L, I.P, I.Q, Pl), SL = sheetLoads(a, L, Pl, M, made, N.n * N.qf * ropeLength(I), R, cwGear), rc = R.rc, lim = railLimits();
  const checks = railChecks(rc, R.gear, I.v), MPa = (x: number | null): string => (x === null ? '—' : `${fmt(x, 1)} N/mm²`);
  const labels: Readonly<Record<string, string>> = appIt.shaft, rows = checks.map((c) => esito(c));
  const B: ReportBlock[] = [
    { t: 'p', text: `Guide di cabina ${railLabel(L.inputs.carRail)} in acciaio Rm ${KV_GUIDE.railRm} N/mm² (ipotesi del software), paracadute ${Pl.safetyGear ? GEAR_IT[Pl.safetyGear] : `${GEAR_IT[R.gear]} (preso dal software: non indicato nei dati dell’impianto)`}, `
      + `staffe al più ogni ${fmt(R.span, 0)} mm (${R.hs.length} staffe per guida${Pl.carBracketPitch ? `, passo dei dati dell’impianto ${fmt(Pl.carBracketPitch, 0)} mm` : `, passo della regola ${fmt(KV_VERT.bracketPitch, 0)} mm`}). `
      + 'Le stesse forze e gli stessi limiti del foglio 1 delle tavole (voce guide.verifica).' },
    { t: 'kv', rows: [
      ['Campata più lunga · snellezza λ · ω', `${fmt(rc.l, 0)} mm · ${fmt(rc.lambda, 0)} · ${rc.omega === null ? 'oltre la tabella' : fmt(rc.omega, 2)}`],
      ['Spinte all’intervento del paracadute Fx · Fy', `${fmt(R.F.fx, 0)} · ${fmt(R.F.fy, 0)} daN`],
      ['Paracadute: σm · σ · σk · σc', `${MPa(rc.gear.sm)} · ${MPa(rc.gear.s)} · ${MPa(rc.gear.sk)} · ${MPa(rc.gear.sc)} (ammessa ${MPa(lim.gear)})`],
      ['Marcia: σm · σ', `${MPa(rc.run.sm)} · ${MPa(rc.run.s)} (ammessa ${MPa(lim.use)})`],
      [`Caricamento (${fmt(rc.load.sill, 2)}·g·Q sulla soglia): σm · σ`, `${MPa(rc.load.sm)} · ${MPa(rc.load.s)} (ammessa ${MPa(lim.use)})`],
      ['Flessione della suola: paracadute · uso', `${MPa(rc.flange.gear)} · ${MPa(rc.flange.use)}`],
      ['Frecce δx · δy', `${fmt(rc.dx, 1)} · ${fmt(rc.dy, 1)} mm (ammessa ${fmt(KV_GUIDE.railDeflection, 0)} mm)`],
    ] },
    { t: 'grid', head: ['Verifica', 'Valore', 'Limite', 'Esito'], rows: checks.map((c, i) => [(labels[`c_${c.id}`] ?? c.id), c.value === null ? '—' : `${fmt(c.value, c.dec)}${c.unit ? ` ${c.unit}` : ''}`,
      c.limit === null ? '' : `≤ ${fmt(c.limit, c.dec)}${c.unit ? ` ${c.unit}` : ''}`, rows[i]?.text ?? st(c.status)]),
    status: rows.map((r): BlockStatus => r.status), statusCol: 3, widths: [0.5, 0.17, 0.17, 0.16], align: ['l', 'r', 'r', 'l'] },
  ];
  const ld = SL.ld, P = ld.P, dyn = fmt(SL.dyn, 1), below = I.layout === 'bottom', daN = (x: number | null | undefined, each = false): string => (x == null ? '—' : `${each ? 'cad. ' : ''}${fmt(x, 0)}`);
  const mass: [string, string][] = [
    [`Argano${SL.machine.estimate ? ' (argano completo, stima ⚠)' : ''}`, `${fmt(SL.machine.kg, 0)} kg${below ? ' (in basso, non sulla soletta)' : ''}`],
    ...supportRows(SL.support, M, fmt).map(([l, v]): [string, string] => [l.charAt(0) + l.slice(1).toLowerCase().replace('(stima)', '(stima ⚠)'), `${v} kg`]),
    ...(SL.heb ? [[`Putrelle ${SL.heb.profile} sui muri del vano (due)`, `${fmt(SL.hebKg, 0)} kg`] as [string, string]] : []),
    [below ? 'Carico statico sulle pulegge in testata' : 'Carico statico sull’asse dell’argano', `${fmt(ld.static, 0)} kg; per il coefficiente dinamico × ${dyn}: ${fmt(ld.dynamic, 0)} kg`],
    ...(SL.anchor ? [['Ancoraggi dell’argano in basso: prova 1,25·Q · portata × coefficiente dinamico',
      `${fmt(Math.max(0, SL.anchor.test), 0)} · ${fmt(Math.max(0, SL.anchor.dyn), 0)} kg (tirafondi e ancoranti: il maggiore; la massa del catalogo, non moltiplicata)`] as [string, string]] : []),
  ];
  B.push({ t: 'kv', rows: mass });
  B.push({ t: 'grid', head: ['Carico', 'daN', 'Come si ottiene', 'Dove'], widths: [0.2, 0.12, 0.43, 0.25], align: ['l', 'r', 'l', 'l'], rows: [
    ['P1', daN(P[0]), below ? `carico statico sulle pulegge in testata × ${dyn}` : `carico statico sull’asse × ${dyn}`, below ? 'appoggi delle pulegge in testata' : 'appoggi dell’argano sulla soletta'],
    ['P2', daN(P[1]), `taglia 2:1: (P + Q)/2 × ${dyn}`, 'attacco delle funi di cabina'],
    ['P3', daN(P[2]), `taglia 2:1: M_cw/2 × ${dyn}`, 'attacco delle funi del contrappeso'],
    ['P4', daN(P[3]), 'dato del costruttore del limitatore (dati dell’impianto)', 'limitatore nel locale'],
    ['P5', daN(P[4], true), `paracadute: k1·g·(P + Q)/2 + peso della guida (k1 ${R.gear === 'progressive' ? KV_VERT.k1Progressive : R.gear === 'roller' ? KV_VERT.k1Roller : KV_VERT.k1Instant})`, 'piede di ogni guida di cabina'],
    ['P6', daN(P[5], L.inputs.vertical.carBuffers > 1), `${KV_VERT.bufferFactor}·g·(P + Q) diviso tra ${L.inputs.vertical.carBuffers} ammortizzatori`, 'fondo della fossa, ammortizzatori di cabina'],
    ['P7', daN(P[6], true), cwGear ? `paracadute del contrappeso: k1·g·M_cw/2 + peso della guida (k1 ${cwGear === 'progressive' ? KV_VERT.k1Progressive : cwGear === 'roller' ? KV_VERT.k1Roller : KV_VERT.k1Instant})`
      : 'peso della guida', 'piede di ogni guida del contrappeso'],
    ['P8', daN(P[7]), `${KV_VERT.bufferFactor}·g·M_cw`, 'fondo della fossa, ammortizzatore del contrappeso'],
    ['P9', daN(P[8]), below ? 'P1 + P2 + P3 (l’argano è in basso)' : 'P1 + P2 + P3 + argano, telaio, basamento e putrelle (senza coefficiente)', 'totale sulla soletta del locale'],
  ] });
  B.push({ t: 'p', style: 'note', text: 'Carichi non contemporanei, secondo UNI EN 81-20:2020, 5.2.1.8.1 e 5.2.1.8.4–5.2.1.8.6 (voci carichi.macchina, carichi.fossa, '
    + 'guide.spinte, impianto.massa.basamento); il progettista strutturale verifica soletta, fondo della fossa e ancoraggi con questi valori. P = cabina con '
    + 'il cavo flessibile, Q portata, M_cw contrappeso.' });
  return { checks, blocks: B };
}
