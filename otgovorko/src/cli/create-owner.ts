import { PrismaClient } from '@prisma/client';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { z } from 'zod';
import { encryptSecret } from '../auth/crypto.js';
import { PASSWORD_MIN_LENGTH, hashPassword } from '../auth/password.js';
import { PrismaOwnerStore } from '../auth/prisma-owner-store.js';
import { generateTotpSecret, otpauthUrl, readableSecret } from '../auth/totp.js';
import { loadConfig } from '../config.js';

/**
 * Създава единствения акаунт (собственика). Паролата се въвежда интерактивно, не като аргумент
 * (да не остава в историята на шела). Отказва, ако вече има собственик.
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const db = new PrismaClient();
  try {
    if ((await db.owner.count()) > 0)
      throw new Error('Собственик вече има — Отговорко е за един човек.');
    // Паролата не се показва на екрана (не остава в историята на терминала) и не се реже:
    // /login я проверява дословно, затова и тук се хешира дословно (прегледът на #509).
    let muted = false;
    const output = new Writable({
      write(chunk: Buffer, _enc, cb) {
        if (!muted) process.stdout.write(chunk);
        cb();
      },
    });
    const rl = createInterface({ input: process.stdin, output, terminal: true });
    const email = z.email().parse((await rl.question('Имейл: ')).trim());
    process.stdout.write(`Парола (поне ${PASSWORD_MIN_LENGTH} знака, не се показва): `);
    muted = true;
    const password = await rl.question('');
    muted = false;
    process.stdout.write('\n');
    rl.close();
    if (password.length < PASSWORD_MIN_LENGTH) throw new Error('Паролата е твърде къса.');
    const secret = generateTotpSecret();
    await new PrismaOwnerStore(db).create({
      email,
      passwordHash: await hashPassword(password),
      totpSecretEnc: encryptSecret(secret, config.totpKey),
    });
    process.stdout.write(
      `\nДобави в приложението за 2FA:\n  ${otpauthUrl('Отговорко', email, secret)}\n  тайна: ${readableSecret(secret)}\n`,
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.message : 'грешка'}\n`);
  process.exit(1);
});
