import type { User } from '@prisma/client';
import QRCode from 'qrcode';
import { z } from 'zod';
import { config } from '../config.js';
import { decryptSecret, encryptSecret, safeEqual } from '../crypto.js';
import { otpauthUrl } from '../auth/totp.js';

/**
 * Започнатата настройка на втория фактор: тайната, QR кодът и запечатаното копие за формата. Сгрешена цифра
 * при потвърждението не бива да прати човека да започне отначало (и да трие вече добавения запис в
 * приложението си): формата носи тайната, шифрована с ENC_KEY заедно с акаунта и часа, и при грешен код
 * страницата се показва пак със същата тайна — най-много SETUP_TTL_MS след началото. Само чрез формата:
 * открадната сесия без паролата не научава започнатата тайна.
 */
export interface TotpSetup {
  secret: string;
  /** Тайната на групи по 4 знака — за преписване на ръка (без 0/O и 1/I в base32). */
  grouped: string;
  qrDataUrl: string;
  /** Запечатаната тайна за скритото поле на формата за потвърждение. */
  sealed: string;
}

export const SETUP_TTL_MS = 10 * 60 * 1000;

const sealedSchema = z.object({ u: z.string(), s: z.string(), at: z.number() });

export async function totpSetupView(
  user: Pick<User, 'id' | 'email'>,
  secret: string,
  at: number = Date.now(),
): Promise<TotpSetup> {
  const url = otpauthUrl(config().TOTP_ISSUER, user.email, secret);
  return {
    secret,
    grouped: secret.replace(/(.{4})(?=.)/g, '$1 '),
    qrDataUrl: await QRCode.toDataURL(url, { margin: 1, width: 232 }),
    sealed: encryptSecret(JSON.stringify({ u: user.id, s: secret, at }), config().ENC_KEY),
  };
}

/**
 * Същата настройка, ако формата я носи, още е започната (нито включена, нито сменена с нова) и не е по-стара
 * от SETUP_TTL_MS; иначе null — човекът започва отначало, както преди.
 */
export async function resumeTotpSetup(
  user: Pick<User, 'id' | 'email' | 'totpSecretEnc' | 'totpEnabledAt'>,
  sealed: string,
  now: number = Date.now(),
): Promise<TotpSetup | null> {
  if (!sealed || user.totpEnabledAt || !user.totpSecretEnc) return null;
  let opened: z.infer<typeof sealedSchema>;
  try {
    const parsed = sealedSchema.safeParse(
      JSON.parse(decryptSecret(sealed, config().ENC_KEY)) as unknown,
    );
    if (!parsed.success) return null;
    opened = parsed.data;
  } catch {
    return null;
  }
  if (opened.u !== user.id || now - opened.at > SETUP_TTL_MS || opened.at > now) return null;
  if (!safeEqual(opened.s, decryptSecret(user.totpSecretEnc, config().ENC_KEY))) return null;
  return totpSetupView(user, opened.s, opened.at);
}
