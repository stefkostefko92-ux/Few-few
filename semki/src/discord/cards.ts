// Снимките под съобщенията в Discord: за всяка карта (src/domain/cards.ts) — прикачен файл от
// assets/seeds и вграждане (embed) с цвета на вида, заглавие, текст и снимката. Липсващ файл значи
// карта без снимка изобщо (пропуска се), не провал на съобщението.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { APIEmbed } from 'discord.js';
import type { SeedCard } from '../domain/cards.js';
import type { InfoMessage } from '../domain/info.js';

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
      // празно описание Discord го отказва — тогава картата е само заглавие и снимка
      ...(c.text ? { description: c.text } : {}),
      color: c.color,
      image: { url: `attachment://${c.file}` },
    })),
  };
}

export interface InfoPayload {
  content?: string;
  embeds: APIEmbed[];
  files: Array<{ attachment: string; name: string }>;
}

// /infosemki: картите на видовете — снимката (ако файлът я има) под текста, бележката отдолу.
export function infoPayload(message: InfoMessage, dir = SEEDS_DIR): InfoPayload {
  const files: InfoPayload['files'] = [];
  const embeds = message.embeds.map((e): APIEmbed => {
    const image =
      e.image && FILE_NAME.test(e.image) && existsSync(path.join(dir, e.image)) ? e.image : null;
    if (image && !files.some((f) => f.name === image))
      files.push({ attachment: path.join(dir, image), name: image });
    return {
      title: e.title,
      description: e.description,
      color: e.color,
      ...(e.footer ? { footer: { text: e.footer } } : {}),
      ...(image ? { image: { url: `attachment://${image}` } } : {}),
    };
  });
  return { ...(message.content ? { content: message.content } : {}), embeds, files };
}
