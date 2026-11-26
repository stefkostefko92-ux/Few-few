// Пароли: argon2id (RFC 9106, втора препоръка: m = 64 MiB, t = 3) и правила по NIST SP 800-63B
// (дължина + забранен списък + без лични данни; без задължителни „главна, цифра, знак“).
import * as argon2 from "argon2";

const OPTIONS = { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 } as const;

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 256;

const COMUNI = ["password", "passw0rd", "parola", "qwerty", "qwertyuiop", "asdfgh", "iloveyou", "letmein", "welcome", "benvenuto", "ascensore", "ascensori", "liftcon", "1234567890", "abc123"];

export type ProblemaPassword = "corta" | "lunga" | "comune" | "personale" | "ripetitiva";

export const MESSAGGI_PASSWORD: Record<ProblemaPassword, string> = {
  corta: `La password deve avere almeno ${PASSWORD_MIN} caratteri.`,
  lunga: `La password può avere al massimo ${PASSWORD_MAX} caratteri.`,
  comune: "La password è troppo comune: scelga una frase più personale.",
  personale: "La password non può contenere il suo nome o la sua email.",
  ripetitiva: "La password ripete troppo pochi caratteri diversi.",
};

export function problemaPassword(pw: string, personali: string[] = []): ProblemaPassword | null {
  if (pw.length < PASSWORD_MIN) return "corta";
  if (pw.length > PASSWORD_MAX) return "lunga";
  if (new Set(pw).size < 4) return "ripetitiva";
  const s = pw.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (COMUNI.some((w) => s.includes(w) && w.length * 2 >= s.length)) return "comune";
  for (const p of personali) {
    for (const parte of p.toLowerCase().split(/[^a-z0-9]+/)) {
      if (parte.length >= 4 && s.includes(parte)) return "personale";
    }
  }
  return null;
}

export const hashPassword = (pw: string): Promise<string> => argon2.hash(pw, OPTIONS);

export async function verificaPassword(hash: string, pw: string): Promise<boolean> {
  if (pw.length > PASSWORD_MAX) return false;
  try {
    return await argon2.verify(hash, pw);
  } catch {
    return false;
  }
}

/** Хеш с фиксирана сол за „грешен имейл“: времето на отговор е същото като при грешна парола. */
let fittizio: Promise<string> | null = null;
export async function verificaFittizia(pw: string): Promise<false> {
  fittizio ??= argon2.hash("liftcon-account-inesistente", OPTIONS);
  await argon2.verify(await fittizio, pw.slice(0, PASSWORD_MAX)).catch(() => false);
  return false;
}
