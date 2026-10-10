// Drawer slide systems from the manufacturers' documents (each system's `source`, the pages in the notes). Carcass
// hole positions are from the front edge of the cabinet side, by nominal length NL. Values marked "наш избор" are the
// generator's own choices where the document is silent; they are shown as such in the drawings.

const TANDEM_NL = [270, 300, 350, 400, 450, 500, 550, 600];
const tandemHoles = (nl) => (nl <= 270 ? [37, 69, 133] : nl <= 380 ? [37, 69, 261] : nl <= 420 ? [37, 69, 229] : nl <= 550 ? [37, 69, 261] : [37, 69, 261, 325]);

export const SLIDE_SYSTEMS = [
  {
    id: 'gtv_h45',
    name: 'GTV H45 PRESTIGE — сачмен, страничен монтаж, 45 mm',
    brand: 'GTV',
    mount: 'side',
    sideClearance: 12.7,
    lengths: [250, 300, 350, 400, 450, 500, 550, 600, 650, 700, 750],
    holes: { 250: [37, 101, 197], 300: [37, 101, 261], 350: [37, 101, 261], 400: [37, 101, 261, 357], 450: [37, 101, 261, 389], 500: [37, 101, 261, 389], 550: [37, 101, 261, 389, 485], 600: [37, 101, 261, 389, 485], 650: [37, 101, 261, 389, 581], 700: [37, 101, 261, 389, 517, 645], 750: [37, 101, 261, 389, 549, 677] },
    hole: { d: 3, depth: 10, note: 'пилот за винт за ПДЧ — наш избор (GTV не посочва винта)' },
    axisAboveBox: 22.3, // наш избор: долният ръб на профила 44,5 mm = долният ръб на кутията
    drawerLength: (nl) => nl,
    maxWidth: (nl) => nl, // „Uwagi montażowe“ в картата: за правилната работа чекмеджето не е по-широко от NL
    // GTV Karta techniczna H45 Prestige (Katalog akcesoria meblowe techniczne 2020), стр. 147, PLANOWANIE: „szuflada
    // standardowa … SKL = NL … NL + 3“ — размерът е от ръба на шкафа по чертежа; тълкуването му като най-малката
    // вътрешна дълбочина е наше. https://assets.gtv.com.pl/assets/attachments/karta_techniczna/Karta_techniczna_2020_148-149.pdf
    depthNeeded: (nl) => nl + 3,
    boxSide: 16,
    bottomUp: 10,
    loadKg: 35,
    extension: 'full',
    source: { title: 'GTV продуктова карта H45 PRESTIGE (каталожна стр. 74); GTV „Prowadnice“ 2024, стр. 13', url: 'https://assets.gtv.com.pl/assets/attachments/karta_produktowa/Karta_produktowa_PL-EN-RU__2021_76.pdf' },
  },
  {
    id: 'blum_tandem_560h',
    name: 'Blum TANDEM 560H — скрит водач, страница на чекмеджето 16 mm',
    brand: 'Blum',
    mount: 'under',
    innerWidthMinus: 42, // SKW = LW − 42
    lengths: TANDEM_NL,
    holes: Object.fromEntries(TANDEM_NL.map((nl) => [nl, tandemHoles(nl)])),
    hole: { d: 5, depth: 13, note: 'за системен винт Ø6 × 14,5 (Blum 661.1450.HG); Ø5 × 13 — наш избор по системата 32 mm' },
    axisAboveBottom: 9.5, // ос на винтовете над долната страна на дъното: 37 − 27,5 (TD-127/3 стр. 5)
    drawerLength: (nl) => nl - 10,
    depthNeeded: (nl) => nl + 3,
    boxSide: 16,
    bottomUp: 13, // дъното е вдлъбнато 12–15 mm
    rearHook: { d: 6, depth: 10, fromOuter: 7, fromBottom: 11 },
    clearBelow: 27.5, // от долната страна на дъното на чекмеджето до дъното на шкафа: „min 27.5*“ (стр. 5)
    // Комплект за странична стабилизация при пълно изтегляне (стр. 4): „Up to 410 ZST.410TV / Up to 600 ZST.600TV / Up to
    // 750 ZST.750TV“, „Suitable for cabinet width KB 1400 mm“, рязане „LW - 254 mm“ (вал) и „NL + 12 mm“ (зъбна рейка);
    // с него „NL + 3*“ … „* Additional +12 mm“ и „* +3 mm with side stabilisation“ под водача (стр. 5); „Not compatible with
    // TIP-ON“ (стр. 21). Кога се слага — engine/stabiliser.js.
    stabiliser: { maxKB: 1400, kits: [[410, 'ZST.410TV'], [600, 'ZST.600TV'], [750, 'ZST.750TV']], shaftMinus: 254, rackPlus: 12, depthPlus: 12, belowPlus: 3, noTipOn: 'Blum TD-127/3, стр. 21', doc: 'TD-127/3, стр. 4–5' },
    loadKg: 30,
    extension: 'full',
    source: { title: 'Blum TD-127/3 EN/07.23 TANDEM 16 mm — Technical data sheet, стр. 4, 5, 21 и 24', url: 'https://d2.blum.com/services/BEC003/me12694698_td_dok_bau_$sen_$aof_$v3.pdf' },
  },
  {
    id: 'blum_movento_760h',
    name: 'Blum MOVENTO 760H — скрит водач, NL 600',
    brand: 'Blum',
    mount: 'under',
    innerWidthMinus: 42,
    lengths: [600],
    holes: { 600: [18, 37, 69, 261, 293] },
    hole: { d: 5, depth: 13, note: 'за системен винт Ø6 × 14,5 (Blum 661.1450.HG); Ø5 × 13 — наш избор по системата 32 mm' },
    axisAboveBottom: 9.5, // 38 − 28,5 (TD-132/1 стр. 5)
    drawerLength: (nl) => nl - 10,
    depthNeeded: (nl) => nl + 3,
    boxSide: 16,
    bottomUp: 13,
    rearHook: { d: 6, depth: 10, fromOuter: 7, fromBottom: 11 },
    clearBelow: 28.5, // „min 28.5“ (стр. 5)
    // Комплект за странична стабилизация (стр. 4): „For NL up to (mm) 400 ZS7M400MU 600 ZS7M600MU 750 ZS7M750MU“, „For KB
    // 1400 mm“, „Shaft cutting dimensions: Internal cabinet width (LW) – 315 mm“, „Gear rack cutting: NL + 10 mm“; „NL + 3*“
    // … „* Additional +12 mm with side stabiliser“ (стр. 5), без добавка под водача. Съвместим с TIP-ON: „Compatible with
    // all MOVENTO motion technologies“ (каталог Blum 2024/2025, стр. 422, https://publications.blum.com/2024/catalogue/en/422/).
    stabiliser: { maxKB: 1400, kits: [[400, 'ZS7M400MU'], [600, 'ZS7M600MU'], [750, 'ZS7M750MU']], shaftMinus: 315, rackPlus: 10, depthPlus: 12, belowPlus: 0, doc: 'TD-132/1, стр. 4–5' },
    loadKg: 40,
    extension: 'full',
    source: { title: 'Blum TD-132/1 EN/06.22 MOVENTO — Technical data sheet, стр. 4, 5, 13 и 19 (отворите — само за NL 600)', url: 'https://d2.blum.com/services/BEC003/me13029704_td_dok_bau_$sen_$aof_$v1.pdf' },
  },
];
