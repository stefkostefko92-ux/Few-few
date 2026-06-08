import { z } from 'zod';

// Данни за осемте глави. Всяка глава е чисти данни — нищо не е hard-coded в
// сцените. Текстовете се пазят в i18n речниците (bg.json / en.json) и тук
// реферираме само ключове.

export const MECHANICS = [
  'tutorial', // тап-обучение/екипиране
  'ceremony', // подреждане/носене на знамето
  'timing', // тайминг-преминаване (лодки)
  'protect', // защити знаменосеца — избегни обкръжение
  'defense', // wave-defense; камъни при липса на патрони
  'march', // кинематична карта + избор по маршрута
  'assault', // тайминг-щурм с трите колони
  'epilogue', // финален епилог
] as const;

export const ChapterSchema = z.object({
  id: z.number().int().positive(),
  key: z.string(), // 'stara_zagora'
  mechanic: z.enum(MECHANICS),
  dateOldKey: z.string(), // i18n ключ за дата по стар стил
  dateNewKey: z.string(), // i18n ключ за дата по нов стил
  titleKey: z.string(), // i18n ключ за заглавието на главата
  introKey: z.string(), // i18n ключ към разказа
  factKeys: z.array(z.string()), // 'Знаеше ли?' факти
  // Цвят-акцент на главата върху картата (за визуално разграничаване).
  accent: z.number().int().nonnegative(),
});

export type Chapter = z.infer<typeof ChapterSchema>;
export type Mechanic = (typeof MECHANICS)[number];

const RAW_CHAPTERS: Chapter[] = [
  {
    id: 1,
    key: 'ploesti',
    mechanic: 'tutorial',
    dateOldKey: 'ch.ploesti.dateOld',
    dateNewKey: 'ch.ploesti.dateNew',
    titleKey: 'ch.ploesti.title',
    introKey: 'ch.ploesti.intro',
    factKeys: ['ch.ploesti.fact1', 'ch.ploesti.fact2'],
    accent: 0x7a6a3a,
  },
  {
    id: 2,
    key: 'samara_flag',
    mechanic: 'ceremony',
    dateOldKey: 'ch.samara_flag.dateOld',
    dateNewKey: 'ch.samara_flag.dateNew',
    titleKey: 'ch.samara_flag.title',
    introKey: 'ch.samara_flag.intro',
    factKeys: ['ch.samara_flag.fact1', 'ch.samara_flag.fact2'],
    accent: 0xb01c2e,
  },
  {
    id: 3,
    key: 'danube',
    mechanic: 'timing',
    dateOldKey: 'ch.danube.dateOld',
    dateNewKey: 'ch.danube.dateNew',
    titleKey: 'ch.danube.title',
    introKey: 'ch.danube.intro',
    factKeys: ['ch.danube.fact1', 'ch.danube.fact2'],
    accent: 0x2f6f8f,
  },
  {
    id: 4,
    key: 'stara_zagora',
    mechanic: 'protect',
    dateOldKey: 'ch.stara_zagora.dateOld',
    dateNewKey: 'ch.stara_zagora.dateNew',
    titleKey: 'ch.stara_zagora.title',
    introKey: 'ch.stara_zagora.intro',
    factKeys: ['ch.stara_zagora.fact1', 'ch.stara_zagora.fact2'],
    accent: 0xa33126,
  },
  {
    id: 5,
    key: 'shipka',
    mechanic: 'defense',
    dateOldKey: 'ch.shipka.dateOld',
    dateNewKey: 'ch.shipka.dateNew',
    titleKey: 'ch.shipka.title',
    introKey: 'ch.shipka.intro',
    factKeys: ['ch.shipka.fact1', 'ch.shipka.fact2', 'ch.shipka.fact3'],
    accent: 0x6b7a3a,
  },
  {
    id: 6,
    key: 'pleven_march',
    mechanic: 'march',
    dateOldKey: 'ch.pleven_march.dateOld',
    dateNewKey: 'ch.pleven_march.dateNew',
    titleKey: 'ch.pleven_march.title',
    introKey: 'ch.pleven_march.intro',
    factKeys: ['ch.pleven_march.fact1', 'ch.pleven_march.fact2'],
    accent: 0x5a6a7a,
  },
  {
    id: 7,
    key: 'sheynovo',
    mechanic: 'assault',
    dateOldKey: 'ch.sheynovo.dateOld',
    dateNewKey: 'ch.sheynovo.dateNew',
    titleKey: 'ch.sheynovo.title',
    introKey: 'ch.sheynovo.intro',
    factKeys: ['ch.sheynovo.fact1', 'ch.sheynovo.fact2'],
    accent: 0x8a5a2a,
  },
  {
    id: 8,
    key: 'liberation',
    mechanic: 'epilogue',
    dateOldKey: 'ch.liberation.dateOld',
    dateNewKey: 'ch.liberation.dateNew',
    titleKey: 'ch.liberation.title',
    introKey: 'ch.liberation.intro',
    factKeys: ['ch.liberation.fact1', 'ch.liberation.fact2'],
    accent: 0x1f6b3a,
  },
];

// Валидираме външните данни още при зареждане (zod). Грешка тук означава
// несъответствие между конфигурацията и схемата — спираме рано.
export const CHAPTERS: readonly Chapter[] = z
  .array(ChapterSchema)
  .parse(RAW_CHAPTERS);

export function getChapter(id: number): Chapter | undefined {
  return CHAPTERS.find((c) => c.id === id);
}

export const TOTAL_CHAPTERS = CHAPTERS.length;
