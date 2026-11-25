// Типографски кавички по език (за цитати в UI, извън преводите).
const MARKS: Record<string, readonly [string, string]> = {
  bg: ['„', '“'],
  de: ['„', '“'],
  cs: ['„', '“'],
  sk: ['„', '“'],
  sl: ['„', '“'],
  hr: ['„', '”'],
  pl: ['„', '”'],
  ro: ['„', '”'],
  hu: ['„', '”'],
  lt: ['„', '“'],
  lv: ['«', '»'],
  et: ['„', '“'],
  it: ['«', '»'],
  nap: ['«', '»'],
  scn: ['«', '»'],
  lmo: ['«', '»'],
  es: ['«', '»'],
  pt: ['«', '»'],
  fr: ['«\u202f', '\u202f»'], // тесен непрекъсваем интервал (не се цепи при split(' '))
  el: ['«', '»'],
  fi: ['”', '”'],
  sv: ['”', '”'],
  da: ['»', '«'],
};

export function quoteMarks(locale: string): readonly [string, string] {
  return MARKS[locale] ?? ['“', '”'];
}
