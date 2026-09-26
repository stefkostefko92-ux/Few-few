// Interface texts in Italian (source, catalogue terminology), English and Bulgarian, with the
// product names used on panevascensori.it. Codes, sizes and page numbers are never translated.
export const LANGS = ['it', 'en', 'bg'];

const T = {
  it: {
    title: 'Staffe Panev in 3D',
    description: 'Le staffe brevettate Panev Ascensori in 3D: modelli in lamiera zincata generati dal catalogo 2026, da ruotare, montare e fotografare.',
    catalog: 'Catalogo 2026',
    families: {
      door: 'Staffe di fissaggio porta di piano',
      SU: 'Supporto universale SU',
      SD: 'Supporto decentrato SD',
      SC: 'Supporto scorrevole SC',
      SG: 'Staffe guida SG',
      special: 'Su disegno esecutivo e fissaggio a parete',
    },
    names: { A: 'Piastra', B: 'Staffa', support: 'Supporto', SG: 'Staffa guida', corner: 'Staffa d’angolo', square: 'Staffa a squadra', arm: 'Braccio rigido regolabile' },
    thickness: 'sp.',
    page: 'Catalogo p.',
    partner: 'Abbinamento',
    indicative: 'Forma indicativa: pezzo su disegno o non quotato per intero a catalogo.',
    hand: 'Mano',
    hands: { DX: 'Destra (DX)', SX: 'Sinistra (SX)' },
    mode: 'Vista',
    modes: { part: 'Pezzo', assembly: 'Montaggio' },
    noPartner: 'Nessun abbinamento a catalogo',
    adjust: { angle: 'Regolazione angolare', reach: 'Distanza guida–parete', slide: 'Posizione della guida lungo la parete' },
    look: 'Luce',
    looks: { studio: 'Studio', night: 'Notte' },
    finish: 'Zincatura',
    finishes: { electro: 'Brillante', hotdip: 'Opaca' },
    rotate: 'Rotazione automatica',
    reset: 'Vista catalogo',
    photo: 'Foto HD (PNG)',
    developing: 'Sviluppo della foto…',
    loading: 'Caricamento del modello 3D…',
    hint: 'Trascina per ruotare · rotellina o pizzico per lo zoom · tasto destro o due dita per spostare',
    note: 'Modelli 3D generati dalle quote del catalogo 2026: in caso di differenze fanno fede catalogo e disegni esecutivi.',
    language: 'Lingua',
    controls: 'Controlli',
    canvas: (name) => `Modello 3D: ${name}`,
    fatal: 'Il browser non supporta WebGPU né WebGL 2: impossibile mostrare il modello 3D.',
  },
  en: {
    title: 'Panev brackets in 3D',
    description: 'Panev Ascensori patented brackets in 3D: galvanised sheet-metal models generated from the 2026 catalogue, to turn, assemble and photograph.',
    catalog: '2026 catalogue',
    families: {
      door: 'Landing door fixing brackets',
      SU: 'SU universal support',
      SD: 'SD offset support',
      SC: 'SC sliding support',
      SG: 'SG guide brackets',
      special: 'To shop drawing and wall fixing',
    },
    names: { A: 'Plate', B: 'Bracket', support: 'Support', SG: 'Guide bracket', corner: 'Corner bracket', square: 'Angle bracket', arm: 'Adjustable rigid arm' },
    thickness: 'th.',
    page: 'Catalogue p.',
    partner: 'Paired with',
    indicative: 'Indicative shape: made to drawing or not fully dimensioned in the catalogue.',
    hand: 'Hand',
    hands: { DX: 'Right (DX)', SX: 'Left (SX)' },
    mode: 'View',
    modes: { part: 'Part', assembly: 'Assembly' },
    noPartner: 'No catalogue pairing',
    adjust: { angle: 'Angular adjustment', reach: 'Rail-to-wall distance', slide: 'Rail position along the wall' },
    look: 'Light',
    looks: { studio: 'Studio', night: 'Night' },
    finish: 'Zinc finish',
    finishes: { electro: 'Bright', hotdip: 'Matte' },
    rotate: 'Auto-rotate',
    reset: 'Catalogue view',
    photo: 'HD photo (PNG)',
    developing: 'Developing the photo…',
    loading: 'Loading the 3D model…',
    hint: 'Drag to rotate · scroll or pinch to zoom · right-drag or two fingers to pan',
    note: '3D models generated from the dimensions in the 2026 catalogue: where they differ, the catalogue and shop drawings prevail.',
    language: 'Language',
    controls: 'Controls',
    canvas: (name) => `3D model: ${name}`,
    fatal: 'This browser supports neither WebGPU nor WebGL 2, so the 3D model cannot be shown.',
  },
  bg: {
    title: 'Планките Panev в 3D',
    description: 'Патентованите планки на Panev Ascensori в 3D: модели от поцинкована ламарина, генерирани от каталога 2026 — за въртене, монтаж и снимки.',
    catalog: 'Каталог 2026',
    families: {
      door: 'Планки за закрепване на етажни врати',
      SU: 'Универсална опора SU',
      SD: 'Изместена опора SD',
      SC: 'Плъзгаща опора SC',
      SG: 'Планки за водач SG',
      special: 'По работен чертеж и закрепване към стена',
    },
    names: { A: 'Пластина', B: 'Планка', support: 'Опора', SG: 'Планка за водач', corner: 'Ъглова планка', square: 'Планка тип „винкел“', arm: 'Регулируемо кораво рамо' },
    thickness: 'деб.',
    page: 'Каталог с.',
    partner: 'Комплект с',
    indicative: 'Ориентировъчна форма: изработва се по чертеж или не е напълно оразмерен в каталога.',
    hand: 'Изпълнение',
    hands: { DX: 'Дясно (DX)', SX: 'Ляво (SX)' },
    mode: 'Изглед',
    modes: { part: 'Детайл', assembly: 'Монтаж' },
    noPartner: 'Няма комплект в каталога',
    adjust: { angle: 'Ъглово регулиране', reach: 'Разстояние водач–стена', slide: 'Позиция на водача по стената' },
    look: 'Светлина',
    looks: { studio: 'Студио', night: 'Нощ' },
    finish: 'Поцинковка',
    finishes: { electro: 'Светла', hotdip: 'Матова' },
    rotate: 'Автоматично въртене',
    reset: 'Каталожен изглед',
    photo: 'HD снимка (PNG)',
    developing: 'Проявяване на снимката…',
    loading: 'Зареждане на 3D модела…',
    hint: 'Плъзни за въртене · колелце или щипка за мащаб · десен бутон или два пръста за преместване',
    note: '3D моделите са генерирани по размерите от каталога 2026; при разлика меродавни са каталогът и работните чертежи.',
    language: 'Език',
    controls: 'Управление',
    canvas: (name) => `3D модел: ${name}`,
    fatal: 'Браузърът не поддържа нито WebGPU, нито WebGL 2 — 3D моделът не може да се покаже.',
  },
};

export const strings = (lang) => T[lang] ?? T.it;

// Language fixed by the page (the site's 3D pages, one address per language, set <html data-lang>),
// else from ?lang=, else the browser's, else Italian.
export function pickLang(
  search = location.search,
  prefs = navigator.languages ?? [navigator.language],
  fixed = globalThis.document?.documentElement.dataset.lang,
) {
  if (LANGS.includes(fixed)) return fixed;
  const q = new URLSearchParams(search).get('lang');
  if (LANGS.includes(q)) return q;
  const hit = prefs.map((l) => String(l).slice(0, 2).toLowerCase()).find((l) => LANGS.includes(l));
  return hit ?? 'it';
}

// Product name as on the site's price list, e.g. "Piastra 170 × 75 mm".
export function itemName(item, t) {
  const [fam] = item.code.split(' ');
  if (item.code === 'SN 60 65') return `${t.names.corner} · ${item.size} mm`;
  if (item.code === 'SN 65 200') return `${t.names.square} · ${item.size} mm`;
  if (fam === 'BRACCIO') return `${t.names.arm} · l. ${item.size} mm`;
  if (fam === 'A' || fam === 'B' || fam === 'SG') return `${t.names[fam]} ${item.size} mm`;
  return `${t.names.support} ${item.size} mm`;
}

// Parts whose 3D shape is indicative: made to the customer's drawing ("misura A") or drawn without
// every dimension in the catalogue.
export const INDICATIVE = new Set(['SC 50 170', 'SG 225 50', 'SN 65 200']);
