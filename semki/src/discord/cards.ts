// Снимките под съобщенията в Discord: за всяка карта (src/domain/cards.ts) — прикачен файл от
// assets/seeds и вграждане (embed) с цвета на вида, заглавие, текст и снимката. Липсващ файл значи
// карта без снимка изобщо (пропуска се), не провал на съобщението.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { APIEmbed } from 'discord.js';
import type { SeedCard } from '../domain/cards.js';

// dist/discord/ и src/discord/ са на две нива под корена на продукта.
export const SEEDS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'assets',
  'seeds',
);

const FILE_NAME = /^[a-z]+-[a-z]+\.jpg$/;

export interface CardPayload {
  files: Array<{ attachment: string; name: string }>;
  embeds: APIEmbed[];
}

export function cardPayload(cards: readonly SeedCard[], dir = SEEDS_DIR): CardPayload {
  const usable = cards.filter((c) => FILE_NAME.test(c.file) && existsSync(path.join(dir, c.file)));
  return {
    files: usable.map((c) => ({ attachment: path.join(dir, c.file), name: c.file })),
    embeds: usable.map((c) => ({
      title: c.title,
      description: c.text,
      color: c.color,
      image: { url: `attachment://${c.file}` },
    })),
  };
}
