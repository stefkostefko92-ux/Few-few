import { misuraCompensazione, type DatiArgano } from './dati.js';
import { funeDi } from './tabelle.js';

/**
 * Изчислението за аргано — формулите на „RT-E MOD 10411-1“ на собственика едно към едно (31 октомври 2026,
 * „като в RT файла“): лист „Macchina“ (скоростта от оборотите, предавателното число, ролката и окачването;
 * при VVVF — нужните обороти и честота; разлика до 5 % спрямо досегашната) и лист „Funi“ (въжетата:
 * сигурност, D/d; сцеплението по EN 81-1 с C1·C2 в двата случая; специфичният натиск). Особеностите на
 * файла са запазени нарочно, за да излизат същите числа: „a“ е минималното C1 на EN 81-1 (1,10…1,25), взето
 * като забавяне; кабелите се добавят към T'2 в килограми; при полукръгъл канал без подрез и „solo verifica“
 * f = 0. Без база и без вход/изход — тества се срещу стойностите от самия Excel.
 */

const G = 9.81;
const MU = 0.09;
/** Ъгълът на подреза β във формулата за полукръгъл канал с подрез (EN 81-50; във файла — 1,83 rad). */
const BETA = 1.83;

const TAGLIA = { '1:1': 1, '1:2': 2, '1:4': 4 } as const;

export interface RisultatoArgano {
  velocita: {
    taglia: number;
    rapporto: number;
    nuova: number;
    preesistente: number;
    variazione: number;
    ok: boolean;
    vvvf: { giri: number; giriArrotondati: number; hz: number } | null;
  };
  funi: {
    d: number;
    sezione: number;
    rottura: number;
    massaLineare: number;
    peso: number;
    massa: number;
    caricoTotale: number;
    caricoFune: number;
    sollecitazione: number;
    sicurezza: number;
    sicurezzaMinima: number;
    okNumero: boolean;
    okDiametro: boolean;
    okSicurezza: boolean;
    diametroMinimo: number;
    rapportoDiametri: number;
    okDiametri: boolean;
  };
  compensazione: {
    d: number;
    massaLineare: number;
    peso: number;
    massaCabina: number;
    massaContrappeso: number;
    rapportoDiametri: number | null;
    ok: boolean;
  };
  aderenza: {
    t1: number;
    t2: number;
    t1Alto: number;
    t2Alto: number;
    cavi: number;
    decelerazione: number;
    c1: number;
    c2: number;
    f: number;
    efa: number;
    rapportoBasso: number;
    rapportoAlto: number;
    okBasso: boolean;
    okAlto: boolean;
  };
  pressione: { velocitaFuni: number; carico: number; p: number; pLim: number; ok: boolean };
}

/** „a“ по скоростта (лист „Funi“, H131); при „decelerazione ridotta“ — 0,5. */
function decelerazioneDi(v: number, ridotta: boolean): number {
  if (ridotta) return 0.5;
  if (v <= 0.63) return 1.1;
  if (v <= 1) return 1.15;
  if (v <= 1.6) return 1.2;
  if (v <= 2.5) return 1.25;
  return 0.5;
}

/** Коефициентът на триене f (H151): клиновиден, полукръгъл с подрез (EN 81-1:1987), формулата на 10411-1. */
function coefficienteF(d: DatiArgano, gamma: number): number {
  const cuneo = MU / Math.sin(gamma / 2);
  const intaglio = (4 * MU * (1 - Math.sin(gamma / 2))) / (Math.PI - gamma - Math.sin(gamma));
  const nuova =
    MU *
    ((4 * (Math.cos(gamma / 2) - Math.sin(BETA / 2))) /
      (Math.PI - BETA - gamma - Math.sin(BETA) + Math.sin(gamma)));
  if (d.gola === 'cuneo') return cuneo;
  if (d.funiSostituzione) return nuova;
  return d.gola === 'semicircolare-intaglio' ? intaglio : 0;
}

export function calcolaArgano(d: DatiArgano): RisultatoArgano {
  const taglia = TAGLIA[d.sospensione];
  // Лист „Macchina“: предавателното число и скоростта.
  const rapporto = d.rapportoB / d.rapportoA;
  const vvvf = d.azionamento === 'VVVF';
  const nuova = vvvf
    ? d.velocitaVvvf!
    : (d.giriMotore! * Math.PI * d.diametroPuleggia) / (rapporto * 60000 * taglia);
  const giri = vvvf ? (nuova * rapporto * 60000 * taglia) / (Math.PI * d.diametroPuleggia) : 0;
  const preesistente = d.velocita;
  const variazione = (nuova - preesistente) / preesistente;

  // Лист „Funi“: въжето, теглата, компенсацията.
  const fune = d.fune === 'altro' ? d.funeAltro! : funeDi(d.fune)!;
  const n = d.funiNumero;
  const peso = n * fune.massa * d.corsa * G * taglia;
  const comp =
    d.compensazione === 'nessuna' ? undefined : misuraCompensazione(d.compensazione, d.compMisura);
  const compPeso = d.compNumero * (comp?.massa ?? 0) * d.corsa * G;
  const metaCorsa = d.compMetaCorsa;
  const compCabina = (compPeso * (metaCorsa ? 0 : 1)) / G;
  const compContrappeso = compPeso / (metaCorsa ? 2 : 1) / G;
  const tenditore = d.massaTenditore / 2;
  // Кабелите: 0,8 × ход / 2 — във файла се добавят към силите без × g.
  const cavi = (0.8 * d.corsa) / 2;
  const conFuni = d.macchina === 'basso' ? 0 : 1;

  const caricoTotale = ((d.portata + d.massaCabina + tenditore + compCabina) * G + peso) / taglia;
  const caricoFune = caricoTotale / n;
  const sicurezza = fune.rottura / caricoFune;
  const sicurezzaMinima = n === 2 ? 16 : 12;
  const rapportoDiametri = d.diametroPuleggia / fune.d;
  const compRapporto = d.compensazione === 'funi' && comp ? d.diametroTenditore / comp.d : null;

  // Сцеплението: кабина долу със 125 % товар, кабина горе празна.
  const t1 = ((d.massaCabina + 1.25 * d.portata + tenditore) * G + peso * conFuni) / taglia;
  const t2 = ((d.massaContrappeso + tenditore + compContrappeso) * G) / taglia;
  const t2Alto = ((d.massaCabina + tenditore + compCabina) * G + cavi) / taglia;
  const t1Alto = ((d.massaContrappeso + tenditore) * G + peso * conFuni) / taglia;
  const decelerazione = decelerazioneDi(d.velocita, d.decelerazioneRidotta);
  const c1 = (G + decelerazione) / (G - decelerazione);
  const c2 = d.gola === 'cuneo' ? 1.2 : 1;
  const gamma = (d.angoloGola * Math.PI) / 180;
  const alfa = (d.angoloAvvolgimento * Math.PI) / 180;
  const f = coefficienteF(d, gamma);
  const efa = Math.exp(f * alfa);
  const rapportoBasso = c1 * c2 * (t1 / t2);
  const rapportoAlto = (c1 * c2 * t1Alto) / t2Alto;

  // Специфичният натиск.
  const velocitaFuni = d.velocita * taglia;
  const carico = ((d.massaCabina + d.portata + tenditore) * G + peso) / taglia;
  const nd = n * fune.d * d.diametroPuleggia;
  const p =
    d.gola === 'cuneo'
      ? ((carico / nd) * 4.5) / Math.sin(gamma / 2)
      : (carico * 8 * Math.cos(gamma / 2)) / (nd * (Math.PI - gamma - Math.sin(gamma)));
  const pLim = ((12.5 + 4 * velocitaFuni) / (1 + velocitaFuni)) * 0.981;

  return {
    velocita: {
      taglia,
      rapporto,
      nuova,
      preesistente,
      variazione,
      ok: Math.abs(variazione * 100) <= 5,
      vvvf: vvvf
        ? {
            giri,
            giriArrotondati: Math.round(giri / 10) * 10,
            hz: ((d.motoreVvvf === 1000 ? 6 : 4) / 120) * giri,
          }
        : null,
    },
    funi: {
      d: fune.d,
      sezione: fune.sezione,
      rottura: fune.rottura,
      massaLineare: fune.massa,
      peso,
      massa: peso / G,
      caricoTotale,
      caricoFune,
      sollecitazione: caricoFune / fune.sezione,
      sicurezza,
      sicurezzaMinima,
      okNumero: n >= 2,
      okDiametro: fune.d >= 8,
      okSicurezza: n >= 2 && sicurezza > sicurezzaMinima,
      diametroMinimo: 40 * fune.d,
      rapportoDiametri,
      okDiametri: rapportoDiametri >= 40,
    },
    compensazione: {
      d: comp?.d ?? 0,
      massaLineare: comp?.massa ?? 0,
      peso: compPeso,
      massaCabina: compCabina,
      massaContrappeso: compContrappeso,
      rapportoDiametri: compRapporto,
      ok: compRapporto === null || compRapporto >= 30,
    },
    aderenza: {
      t1,
      t2,
      t1Alto,
      t2Alto,
      cavi,
      decelerazione,
      c1,
      c2,
      f,
      efa,
      rapportoBasso,
      rapportoAlto,
      okBasso: rapportoBasso <= efa,
      okAlto: rapportoAlto <= efa,
    },
    pressione: { velocitaFuni, carico, p, pLim, ok: p <= pLim },
  };
}
