// Hinge drilling systems from the manufacturers' official documents (collected in catalog/hinge-drilling.json;
// every value there carries its source and page). Overlay model, valid for all four systems:
//   overlay F = C + base[variant] − plate        (C = door edge to cup rim, plate = mounting-plate distance/height)
// Blum: F = 11 + TB − D − K (K = 0 / 9.5 / 18), derived from Blum's tables and checked against all 40 cells.
// Hettich: F = C + B − A (B = 12.5 full / 3 half). GTV: F = K + 12 / 5 / −4 − H (checked against 18 table cells).
// Salice: D = 15 / 6 / −2 + K − H (Series 200 catalogue 02/2026, p. 7).

const SRC = {
  blum: [
    { id: 'B1', title: 'Blum MD-029/3 · 11.24 CLIP top BLUMOTION, CLIP top, CLIP — инструкция за монтаж', url: 'https://d2.blum.com/services/BEC003/me164570_md_dok_bau_$sall_$aof_$v3.pdf' },
    { id: 'B3', title: 'Blum Catalogue and technical manual 2024/2025, стр. 76–77, 150–153', url: 'https://publications.blum.com/2024/catalogue/en/77/' },
    { id: 'B4', title: 'Blum CLIP top BLUMOTION 107° — Product/Technical information FAQ (01.2025), стр. 6', url: 'https://shop-sg.blum.com/img/manager/1cb081b7eb93bb4b65053e82c2040332e52653b7.pdf' },
    { id: 'B5', title: 'Blum EASY ASSEMBLY — CLIP top BLUMOTION Number of hinges', url: 'https://ea.blum.com/en/number-of-hinges/' },
    { id: 'B6', title: 'Blum Inc. LIT.HNG2100.08.10 CLIP top BLUMOTION (2010), стр. 4', url: 'https://d2.blum.com/services/BEC003/cliptopbmn_fl_dok_bus_$sen-us_$aof_$v1.pdf' },
  ],
  hettich: [{ id: 'H1', title: 'Hettich „Техника и иновации 2025“ (BG), Sensys: стр. 22–27, 90–97, 129–130', url: 'https://catalog.hettich.com/General/TuI_2025/bg_BG/catalogs/TuI_2025_bg_BG/pdf/save/bk_24.pdf' }],
  gtv: [{ id: 'G1', title: 'GTV техническа карта BICN / INHC / ECHC / SOLID PLUS (2020)', url: 'https://assets.gtv.com.pl/assets/attachments/karta_techniczna/Karta_techniczna_2020_40-41.pdf' }],
  salice: [{ id: 'S1', title: 'Salice Series 200 — каталог 02/2026, стр. 3, 6, 7; монтажни пластини стр. 13', url: 'https://www.salice.com/media/Catalog/hinges/self-closing-hinges/series-200/Salice_SELF-CLOSING-HINGES-SERIES-200_eng.pdf' }],
};

export const HINGE_SYSTEMS = [
  {
    id: 'blum_clip_top',
    name: 'Blum CLIP top / CLIP top BLUMOTION 110°',
    brand: 'Blum',
    cup: { d: 35, depth: 13, c: [3, 7], note: 'Ø35 +0,2; дълбочина 10,5–13 (MD-029/3 стр. 4); TB 3–7 (каталог стр. 77)' },
    fixings: { spacing: 45, offset: 9.5, dowel: { d: 8, depth: 13, note: 'Ø8 ±0,1 (MD-029/3 стр. 4); дълбочина ≥ 13 по документа от 2010 г. (B6)' }, screw: 'винт 3,5 × 17' },
    plate: { setback: 37, holes: [-16, 16], d: 5, depth: 12, depthNote: 'Ø5 ±0,1 за системни (евро) винтове; дълбочината не е дадена от Blum — по системата 32 mm', plates: [0, 3, 6, 9, 18], productName: 'Монтажна планка CLIP, кръстата 37/32' },
    overlay: { base: { full: 11, half: 1.5, inset: -7 } },
    count: { source: 'Blum B4 стр. 6 (отчетено от графика, ± 50 mm)', rows: [[2, 750, 6], [3, 1500, 12], [4, 2100, 17], [5, 2500, 22]] },
    positions: { fromEdge: 80, note: 'Blum: пантите — възможно най-раздалечени' },
    sources: SRC.blum,
  },
  {
    id: 'hettich_sensys',
    name: 'Hettich Sensys 110°',
    brand: 'Hettich',
    cup: { d: 35, depth: 12.8, c: [3, 7], note: 'Ø35 +0,2; дълбочина 12,8; C 3–7; врата 15–24 mm (стр. 22, 27)' },
    fixings: { spacing: 52, offset: 5.5, dowel: { d: 10, depth: 11, note: 'TH 52×5,5: впресоване Ø10 × 11 (стр. 22)' }, screw: 'винт 3,5 × 16' },
    plate: { setback: 37, holes: [-16, 16], d: 5, depth: 12, depthNote: 'евровинтове Ø5 × 12 (стр. 90–97)', plates: [0, 1.5, 3, 5, 8], productName: 'Монтажна планка Sensys 37/32' },
    overlay: { base: { full: 12.5, half: 3 } },
    count: { source: 'Hettich стр. 129', rows: [[2, 1000, 7.7], [3, 1700, 13.7], [4, 2200, 17.1], [5, 2400, 22], [6, 2600, 22], [7, 2800, 22]] },
    positions: { fromEdge: 80, edgeRange: [60, 100], minSpacing: 280, note: 'Hettich: 60–100 mm от горния и долния ръб, между пантите ≥ 280 mm, врата ≤ 600 mm (стр. 129)' },
    sources: SRC.hettich,
  },
  {
    id: 'gtv_euro35',
    name: 'GTV евро панта Ø35',
    brand: 'GTV',
    cup: { d: 35, depth: 12, c: [3, 5], note: 'Ø35, дълбочина 12; K 3–5 по таблицата (техническа карта, стр. 39)' },
    fixings: { spacing: 45, offset: 9.5, dowel: null, screw: 'винт за ПДЧ (челен монтаж)' },
    plate: { setback: 37, holes: [-16, 16], d: 5, depth: 12, depthNote: 'Ø5 за евровинт, дълбочина 12 (Ø2 пилот за дървесен винт)', plates: [0, 2], productName: 'Монтажна планка GTV 37/32' },
    overlay: { base: { full: 12, half: 5, inset: -4 } },
    count: null,
    positions: { fromEdge: 80, note: 'GTV не дава отстояние — като при Hettich' },
    sources: SRC.gtv,
  },
  {
    id: 'salice_series200',
    name: 'Salice Series 200, 110°',
    brand: 'Salice',
    cup: { d: 35, depth: 12, c: [3, 6], note: 'Ø35; метална чашка 11 mm — отворът не по-плитък (стр. 6); K 3–6' },
    fixings: { spacing: 48, offset: 6, dowel: null, screw: 'винт за ПДЧ (схема 48/6, код C2A…)' },
    plate: { setback: 37, holes: [-16, 16], d: 5, depth: 12, depthNote: 'евровинт Ø5 (пластини Series 200, стр. 13); дълбочината — по системата 32 mm', plates: [0, 2, 3, 4, 6], productName: 'Монтажна планка Salice 37×32' },
    overlay: { base: { full: 15, half: 6, inset: -2 } },
    count: null,
    positions: { fromEdge: 80, note: 'Salice дава само номограма — като при Hettich' },
    sources: SRC.salice,
  },
];
