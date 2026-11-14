import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { datiSalvati } from '../aziende/dati.js';
import { DEFAULT_LOCALE, translate } from '../i18n.js';

/**
 * Информацията по чл. 13 GDPR за хората, които подписват на екрана (клиентът на листа за интервенция,
 * супервайзърът на протокола; собственикът, 12 ноември 2026 — точка D4; условията 15.4 от версия
 * 2026-11-12). Администраторът на данните е фирмата: тя пише текста в настройките (`Azienda.informativaFirme`);
 * докато не го е писала — моделът, попълнен с данните ѝ (наименование, седалище, имейл или телефон).
 */
export const MAX_INFORMATIVA = 4000;

type AziendaInformativa = {
  name: string;
  datiSocietari: Prisma.JsonValue | null;
  informativaFirme: string | null;
};

const it = (key: string, params: Record<string, string | number> = {}) =>
  translate(DEFAULT_LOCALE, key, params);

/** Моделът с данните на фирмата — изходната точка в настройките и текстът, докато фирмата не пише свой. */
export function modelloInformativa(
  azienda: Pick<AziendaInformativa, 'name' | 'datiSocietari'>,
): string {
  const dati = datiSalvati(azienda.datiSocietari);
  const nome = dati?.ragioneSociale || azienda.name;
  const sede = [
    dati?.indirizzo,
    [dati?.cap, dati?.citta].filter(Boolean).join(' '),
    dati?.provincia,
  ]
    .filter((x) => x && x.trim() !== '')
    .join(', ');
  const contatto = dati?.email || dati?.telefono || it('legale.informativa.contattoMancante');
  return it('legale.informativa.modello', {
    azienda: nome,
    sede: sede ? `, ${sede}` : '',
    contatto,
  });
}

/** Текстът на страницата на подписа: написаният от фирмата или моделът. */
export const informativaPerFirma = (azienda: AziendaInformativa): string =>
  azienda.informativaFirme?.trim() ? azienda.informativaFirme : modelloInformativa(azienda);

/** Написаното в настройките: контролните знаци (без новия ред) → интервал, редовете — без интервали в края. */
export const informativaSchema = z
  .string()
  .transform((v) =>
    v
      .replace(/\r\n?/g, '\n')
      .replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, ' ')
      .split('\n')
      .map((r) => r.trimEnd())
      .join('\n')
      .trim(),
  )
  .pipe(z.string().min(1).max(MAX_INFORMATIVA));

/** По избор: имейлът за копието при подписа — празно е „без копие“. */
export const copiaEmailSchema = z
  .string()
  .trim()
  .max(254)
  .transform((v) => (v === '' ? null : v))
  .pipe(z.string().email().nullable());
