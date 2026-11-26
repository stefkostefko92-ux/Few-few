// Схемата на заявката от формата: всяко поле с горна граница; капанът за ботове и времето се гледат отделно.
import { z } from "zod";

export const SERVIZI = ["sopralluogo", "controllo", "preventivi", "supporto", "verifica", "relazioni", "altro"] as const;
export const RUOLI = ["amministratore", "proprietario", "gestore", "altro"] as const;

const testo = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    // Без управляващи символи (освен нов ред и табулация в съобщението).
    .refine((s) => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(s), "caratteri non validi");

/** Едноредов текст (име, община): нов ред би подправил редовете в тялото на писмото. */
const riga1 = (min: number, max: number) => testo(min, max).refine((s) => !/[\r\n\t]/.test(s), "una sola riga");

export const Richiesta = z.object({
  nome: riga1(2, 100),
  email: z.string().trim().max(200).pipe(z.email()),
  telefono: z
    .string()
    .trim()
    .max(30)
    .regex(/^[0-9+ ()./-]*$/)
    .optional()
    .default(""),
  ruolo: z.enum(RUOLI),
  comune: riga1(2, 100),
  servizio: z.enum(SERVIZI),
  messaggio: testo(10, 3000),
  privacy: z.union([z.literal("si"), z.literal(true), z.literal("true"), z.literal("on")]),
  sito_web: z.string().max(200).optional().default(""),
  t: z.union([z.string().max(20), z.number()]).optional(),
});

export type RichiestaValida = z.infer<typeof Richiesta>;

export const ETICHETTE_SERVIZIO: Record<(typeof SERVIZI)[number], string> = {
  sopralluogo: "Sopralluogo tecnico",
  controllo: "Controllo qualità dei lavori",
  preventivi: "Analisi dei preventivi",
  supporto: "Supporto tecnico al committente",
  verifica: "Preparazione alla verifica straordinaria",
  relazioni: "Relazioni e report fotografici",
  altro: "Altro / da definire",
};

export const ETICHETTE_RUOLO: Record<(typeof RUOLI)[number], string> = {
  amministratore: "Amministratore di condominio",
  proprietario: "Proprietario o condomino",
  gestore: "Gestore immobiliare o azienda",
  altro: "Altro",
};

/**
 * Капан за ботове: попълнено скрито поле или формуляр, изпратен под 3 s след зареждане.
 * `t` е ИЗМИНАЛОТО време в ms, мерено от браузъра (performance.now) — не абсолютен час: часовникът на
 * клиента може да избързва и така истинска заявка би се изхвърлила тихо. Без JS полето е празно → не се гледа.
 */
export function sembraBot(r: RichiestaValida): boolean {
  if (r.sito_web.trim() !== "") return true;
  if (r.t === undefined || r.t === "") return false;
  const t = Number(r.t);
  if (!Number.isFinite(t) || t < 0) return true;
  return t < 3000;
}

/** Една линия, без CR/LF — за темата на писмото. */
export function riga(s: string): string {
  return s.replace(/[\r\n\t]+/g, " ").slice(0, 120);
}
