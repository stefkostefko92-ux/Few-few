// Identities of an installation compared as a person would (round 44): the matricola and the lift's number as written
// (digits, the leading zero kept), and an address by its words — lower case, without accents and punctuation, the usual
// abbreviations written out («v.le» → «viale») — one address the same as another when all the words of the shorter are in
// the longer («Via Roma 12» = «Via Roma 12, 20100 Milano (MI)»). Pure.

const ABBREVIAZIONI: Readonly<Record<string, string>> = {
  'v': 'via', 'v.': 'via', 'v.le': 'viale', 'vle': 'viale', 'p.za': 'piazza', 'p.zza': 'piazza', 'pza': 'piazza', 'pzza': 'piazza', 'c.so': 'corso',
  'cso': 'corso', 'l.go': 'largo', 'lgo': 'largo', 'str.': 'strada', 'loc.': 'localita', 'fraz.': 'frazione', 'n.': '', 'n': '', 'nr': '', 'nr.': '', 'civ.': '',
};

/** The words of an address, normalised (abbreviations written out, the house number's «n.» dropped). */
export function paroleIndirizzo(text: string | null | undefined): string[] {
  if (!text) return [];
  const raw = text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().split(/[\s,;()/\\-]+/u).filter(Boolean);
  const out: string[] = [];
  for (const w of raw) {
    const full = ABBREVIAZIONI[w] ?? ABBREVIAZIONI[w.replace(/\.$/, '')] ?? w;
    for (const part of full.split(/[^\p{L}\p{N}]+/u)) if (part) out.push(part);
  }
  return out;
}

/** The same address: every word of the one with fewer words is in the other (at least two words). */
export function stessoIndirizzo(a: string | null | undefined, b: string | null | undefined): boolean {
  const pa = paroleIndirizzo(a), pb = paroleIndirizzo(b);
  const [short, long] = pa.length <= pb.length ? [pa, new Set(pb)] : [pb, new Set(pa)];
  return short.length >= 2 && short.every((w) => long.has(w));
}

/** The address of an installation in one line: street, municipality and province as entered. */
export const indirizzoImpianto = (p: { address: string | null; city: string | null; province: string | null }): string | null =>
  [p.address, p.city, p.province].filter((x): x is string => !!x && x.trim() !== '').join(', ') || null;

/** A matricola or a lift's number as written (digits as text): the same when equal once trimmed. */
export const stessoCodice = (a: string | null | undefined, b: string | null | undefined): boolean => !!a && !!b && a.trim() === b.trim();

/** The words of an address worth a search in the database (not the street's kind, not numbers, at least 4 letters). */
export function paroleDaCercare(text: string | null | undefined, max = 3): string[] {
  const generic = new Set(['via', 'viale', 'piazza', 'corso', 'largo', 'strada', 'localita', 'frazione', 'vicolo', 'piazzale']);
  return [...new Set(paroleIndirizzo(text).filter((w) => w.length >= 4 && !/^\d+$/.test(w) && !generic.has(w)))].sort((x, y) => y.length - x.length).slice(0, max);
}

/** The words that start a street, never a municipality's name. */
const STRADA = /^(?:via|viale|v\.le|piazza|p\.za|p\.zza|piazzale|corso|c\.so|largo|l\.go|vicolo|strada|str\.|localita|località|loc\.|frazione|fraz\.|condominio)\b/iu;

/** A survey's address in its parts (round 46): the municipality written last («…, Milano», «…, 20100 Milano (MI)») goes
 *  to the city — and the province in brackets to the province —, the rest is the street; an address whose last part is
 *  no municipality (a street, a number) is all street. */
export function dividiIndirizzo(text: string | null | undefined): { via: string; citta: string | null; provincia: string | null } {
  const all = (text ?? '').trim(), cut = all.lastIndexOf(','), via = cut > 0 ? all.slice(0, cut).trim() : all;
  const m = cut > 0 ? /^(?:\d{5}\s+)?([\p{L}][\p{L}' .-]*?)(?:\s*\(\s*([A-Za-z]{2})\s*\))?$/u.exec(all.slice(cut + 1).trim()) : null;
  const name = m?.[1]?.trim() ?? '';
  if (!via || !name || STRADA.test(name)) return { via: all, citta: null, provincia: null };
  return { via, citta: name, provincia: m?.[2] ? m[2].toUpperCase() : null };
}

/** The municipality of a survey's address and an installation's city: the same unless both are written and their words
 *  differ (a survey without one says nothing against it). */
export function stessaCitta(indirizzoRilievo: string | null | undefined, citta: string | null | undefined): boolean {
  const a = dividiIndirizzo(indirizzoRilievo).citta;
  if (!a || !citta?.trim()) return true;
  return paroleIndirizzo(a).join(' ') === paroleIndirizzo(citta).join(' ');
}
