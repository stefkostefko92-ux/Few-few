// Видеата на сайта (собственикът, 26.11.2026): двата клипа от panev/3d/video, качени в YouTube (канал Carbon
// Stealth VCC). Фактите са от изходния код на клиповете:
//   seconds — DURATION в 3d/video/timeline.py и 3d/video/guida/timeline.py;
//   steps   — началото на всяка стъпка (STEPS в същите файлове), секунди от началото на клипа;
//   pages   — страниците от каталога, които показват продукта и монтажа му (3d/src/catalog.js; стр. 10 —
//             монтажът на шарнирната планка; стр. 20–21 — SU 220 160 + SG 80 150, както в края на клипа).
// uploaded е денят на качване в YouTube (собственикът). Снимките са наши (img/video/, прави ги
// scripts/video-posters.mjs): страницата не тегли нищо от Google преди клик.
export const VIDEOS = {
  vidDoors: {
    youtube: '0odeUp0MThM',
    seconds: 133,
    uploaded: '2026-11-25',
    poster: 'montaggio-porte',
    families: ['famDoors'],
    pages: [16, 10],
    codes: 'A 45 175 2 + B 45 320',
    steps: [4, 13, 21, 30, 48, 55, 61, 67, 74, 84, 112],
  },
  vidGuides: {
    youtube: 'qJVC75MQlM0',
    seconds: 105,
    uploaded: '2026-11-26',
    poster: 'montaggio-guide',
    families: ['famGuides', 'famSg'],
    pages: [20, 21],
    codes: 'SU 220 160 + SG 80 150',
    steps: [4, 12, 23, 30, 44, 59, 69, 74, 83],
  },
};

export const VIDEO_KEYS = Object.keys(VIDEOS);
// Кое видео показва всяко семейство (страниците по семейства водят към него).
export const VIDEO_OF_FAMILY = Object.fromEntries(
  VIDEO_KEYS.flatMap((key) => VIDEOS[key].families.map((fam) => [fam, key])),
);
