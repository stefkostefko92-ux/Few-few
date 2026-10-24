import type { Prisma } from '@prisma/client';
import QRCode from 'qrcode';
import { logger } from '../logger.js';
import { audit } from './audit.js';
import type { AdminCtx } from './context.js';
import { decryptSecret, deriveKey, encryptSecret } from './crypto.js';
import {
  generateRecoveryCodes,
  generateTotpSecret,
  groupSecret,
  hashRecoveryCode,
  isTotpCode,
  normalizeRecoveryCode,
  otpauthUrl,
  verifyTotp,
} from './totp.js';

/**
 * TOTP на панела (§10): тайната е в `players.totp_secret_enc`, шифрована с AES-256-GCM (ключ,
 * изведен от APP_ENC_KEY; AAD = SteamID — шифротекст, преместен на друг ред, не се отваря).
 * Резервните кодове са само HMAC. Записването е TOFU: първият, минал входа със Steam, го прави.
 */
const context = (steamId: string) => `totp:${steamId}`;
const totpKey = (ctx: AdminCtx) => deriveKey(ctx.encKey, 'totp-secret');
const recoveryKey = (ctx: AdminCtx) => deriveKey(ctx.encKey, 'recovery-code');

export interface SetupView {
  qrDataUrl: string;
  grouped: string;
}

function openSecret(ctx: AdminCtx, steamId: string, sealed: string): string | null {
  try {
    return decryptSecret(sealed, totpKey(ctx), context(steamId));
  } catch (error) {
    // Сменен APP_ENC_KEY или подправен ред: кодът не може да се провери → fail closed.
    logger.error({ err: error instanceof Error ? error.message : String(error) }, 'TOTP тайната');
    return null;
  }
}

/** Започнатото записване: същата тайна до потвърждаване (презареждане не чупи сканирания QR). */
export async function setupView(ctx: AdminCtx, steamId: string, account: string) {
  const player = await ctx.db.player.findUnique({
    where: { steamId },
    select: { totpSecretEnc: true },
  });
  let secret = player?.totpSecretEnc ? openSecret(ctx, steamId, player.totpSecretEnc) : null;
  if (!secret) {
    secret = generateTotpSecret();
    await ctx.db.player.update({
      where: { steamId },
      data: {
        totpSecretEnc: encryptSecret(secret, totpKey(ctx), context(steamId)),
        totpEnabledAt: null,
        totpLastStep: null,
      },
    });
  }
  const view: SetupView = {
    qrDataUrl: await QRCode.toDataURL(otpauthUrl(account, secret), { margin: 1, width: 232 }),
    grouped: groupSecret(secret),
  };
  return view;
}

/**
 * Проверка на код от приложението. Стъпката се записва атомарно: два паралелни опита с един и
 * същ код не минават и двата (UPDATE … WHERE totp_last_step < стъпката).
 */
export async function acceptTotp(
  ctx: AdminCtx,
  steamId: string,
  code: string,
  requireEnabled: boolean,
): Promise<boolean> {
  if (!isTotpCode(code)) return false;
  const player = await ctx.db.player.findUnique({
    where: { steamId },
    select: { totpSecretEnc: true, totpEnabledAt: true, totpLastStep: true },
  });
  if (!player?.totpSecretEnc || (requireEnabled && !player.totpEnabledAt)) return false;
  const secret = openSecret(ctx, steamId, player.totpSecretEnc);
  if (!secret) return false;
  const nowSeconds = Math.floor(ctx.now().getTime() / 1000);
  const step = verifyTotp(secret, code, player.totpLastStep, nowSeconds);
  if (step === null) return false;
  const claimed = await ctx.db.player.updateMany({
    where: { steamId, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] },
    data: { totpLastStep: step },
  });
  return claimed.count === 1;
}

/** Резервен код: еднократен, изразходва се атомарно. */
export async function acceptRecoveryCode(
  ctx: AdminCtx,
  steamId: string,
  input: string,
): Promise<boolean> {
  const code = normalizeRecoveryCode(input);
  if (!code) return false;
  const used = await ctx.db.webRecoveryCode.updateMany({
    where: { steamId, codeHash: hashRecoveryCode(recoveryKey(ctx), steamId, code), usedAt: null },
    data: { usedAt: ctx.now() },
  });
  if (used.count !== 1) return false;
  await audit(ctx.db, { actor: steamId, action: 'totp.recovery_used', target: steamId });
  return true;
}

/** Нов комплект резервни кодове (старите се трият). Показват се веднъж; в базата е само HMAC. */
export async function issueRecoveryCodes(
  ctx: AdminCtx,
  tx: Prisma.TransactionClient,
  steamId: string,
): Promise<string[]> {
  const codes = generateRecoveryCodes();
  const key = recoveryKey(ctx);
  await tx.webRecoveryCode.deleteMany({ where: { steamId } });
  await tx.webRecoveryCode.createMany({
    data: codes.map((code) => ({ steamId, codeHash: hashRecoveryCode(key, steamId, code) })),
  });
  return codes;
}

/** Потвърденото записване: TOTP включен + резервни кодове + одит — в една транзакция. */
export async function enableTotp(ctx: AdminCtx, steamId: string): Promise<string[] | null> {
  return ctx.db.$transaction(async (tx) => {
    const enabled = await tx.player.updateMany({
      where: { steamId, totpEnabledAt: null, totpSecretEnc: { not: null } },
      data: { totpEnabledAt: ctx.now() },
    });
    if (enabled.count !== 1) return null;
    const codes = await issueRecoveryCodes(ctx, tx, steamId);
    await audit(tx, { actor: steamId, action: 'totp.enable', target: steamId });
    return codes;
  });
}

export async function remainingRecoveryCodes(ctx: AdminCtx, steamId: string): Promise<number> {
  return ctx.db.webRecoveryCode.count({ where: { steamId, usedAt: null } });
}

/** Нулиране от по-висок админ (изгубен телефон): тайна, кодове и сесии — наново записване. */
export async function resetTotp(ctx: AdminCtx, actor: string, steamId: string): Promise<void> {
  await ctx.db.$transaction(async (tx) => {
    await tx.player.update({
      where: { steamId },
      data: { totpSecretEnc: null, totpEnabledAt: null, totpLastStep: null },
    });
    await tx.webRecoveryCode.deleteMany({ where: { steamId } });
    await tx.webSession.deleteMany({ where: { steamId } });
    await audit(tx, { actor, action: 'totp.reset', target: steamId });
  });
}
