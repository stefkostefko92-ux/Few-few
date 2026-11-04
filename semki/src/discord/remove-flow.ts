// /iztriisemki: една партида, част от партида (брой) или меню с отметки за няколко наведнъж.
// Изборът в менюто живее в паметта (вързан за човека, 2 минути) — бутонът носи само кратък ключ.
import { randomBytes } from 'node:crypto';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  StringSelectMenuBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type MessageActionRowComponentBuilder,
  type StringSelectMenuInteraction,
} from 'discord.js';
import type { PrismaClient } from '@prisma/client';
import { expiresAt, msLeft, percentAt } from '../domain/decay.js';
import { formatDuration, formatPercent, seedLabel, type SeedLabels } from '../domain/messages.js';
import { idParamSchema, seedKeySchema } from '../domain/validation.js';
import {
  deleteBatch,
  deleteBatches,
  listBatches,
  listSeedTypes,
  removeSeeds,
} from '../services/batches.js';
import { labelsOf, type BatchView } from '../services/mapping.js';
import { actorName, ensureManager, NO_PINGS } from './common.js';
import { OPTION_BATCH, OPTION_COUNT, OPTION_TYPE } from './commands.js';

export const REMOVE_PREFIX = 'semki-del';
const MENU_LIMIT = 25;
const TTL_MS = 2 * 60_000;
const MAX_PENDING = 500;

export interface PendingRemoval {
  userId: string;
  options: number[];
  selected: number[];
  expiresAt: number;
}

export class PendingRemovals {
  private readonly items = new Map<string, PendingRemoval>();

  constructor(
    private readonly ttlMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  create(userId: string, options: number[], selected: number[]): string {
    this.sweep();
    const token = randomBytes(9).toString('base64url');
    this.items.set(token, {
      userId,
      options,
      selected: selected.filter((id) => options.includes(id)),
      expiresAt: this.now() + this.ttlMs,
    });
    return token;
  }

  get(token: string, userId: string): PendingRemoval | null {
    const item = this.items.get(token);
    if (!item) return null;
    if (item.expiresAt <= this.now()) {
      this.items.delete(token);
      return null;
    }
    return item.userId === userId ? item : null;
  }

  select(token: string, userId: string, ids: number[]): boolean {
    const item = this.get(token, userId);
    if (!item) return false;
    item.selected = ids.filter((id) => item.options.includes(id));
    return true;
  }

  take(token: string, userId: string): PendingRemoval | null {
    const item = this.get(token, userId);
    if (item) this.items.delete(token);
    return item;
  }

  private sweep(): void {
    const t = this.now();
    for (const [token, item] of this.items) if (item.expiresAt <= t) this.items.delete(token);
    // Таван срещу трупане: най-старите (първите вмъкнати) излизат първи.
    while (this.items.size >= MAX_PENDING) {
      const oldest = this.items.keys().next().value;
      if (oldest === undefined) break;
      this.items.delete(oldest);
    }
  }
}

function optionLabel(b: BatchView, labels: SeedLabels, at: Date): string {
  const left = msLeft(b, b.rate, at);
  return (
    `#${b.id} ${seedLabel(labels, b.seedTypeKey)} ×${b.count} · ` +
    `${formatPercent(percentAt(b, b.rate, at))} · ${left > 0 ? formatDuration(left) : 'изтекла'}`
  ).slice(0, 100);
}

// В менюто влизат най-скоро изтичащите (до 25 — таванът на Discord за едно меню).
export function menuBatches(batches: readonly BatchView[]): BatchView[] {
  return [...batches]
    .sort((a, b) => expiresAt(a, a.rate).getTime() - expiresAt(b, b.rate).getTime())
    .slice(0, MENU_LIMIT);
}

// Менюто: отметнатите — `selected`, бутонът брои избраните.
export function buildRemovalMenu(
  batches: readonly BatchView[],
  labels: SeedLabels,
  at: Date,
  token: string,
  selected: readonly number[],
): { content: string; components: ActionRowBuilder<MessageActionRowComponentBuilder>[] } {
  const shown = menuBatches(batches);
  const picked = selected.filter((id) => shown.some((b) => b.id === id));
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`${REMOVE_PREFIX}:sel:${token}`)
    .setPlaceholder('Избери партиди…')
    .setMinValues(0)
    .setMaxValues(shown.length)
    .addOptions(
      shown.map((b) => ({
        label: optionLabel(b, labels, at),
        value: String(b.id),
        default: picked.includes(b.id),
      })),
    );
  const go = new ButtonBuilder()
    .setCustomId(`${REMOVE_PREFIX}:go:${token}`)
    .setLabel(`Изтрий избраните (${picked.length})`)
    .setStyle(ButtonStyle.Danger)
    .setDisabled(picked.length === 0);
  const cancel = new ButtonBuilder()
    .setCustomId(`${REMOVE_PREFIX}:no:${token}`)
    .setLabel('Откажи')
    .setStyle(ButtonStyle.Secondary);
  const lines = ['Отметни партидите за триене и натисни бутона (менюто важи 2 минути).'];
  if (batches.length > shown.length) {
    lines.push(
      `Показани са ${shown.length} от ${batches.length} — най-скоро изтичащите. ` +
        'За другите: `/iztriisemki вид:…`.',
    );
  }
  return {
    content: lines.join('\n'),
    components: [
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(menu),
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(go, cancel),
    ],
  };
}

export interface RemoveFlowDeps {
  db: PrismaClient;
  now: () => Date;
}

export function createRemoveFlow(deps: RemoveFlowDeps) {
  const pending = new PendingRemovals(TTL_MS);
  const expired = { content: 'Менюто изтече — пусни `/iztriisemki` пак.', components: [] };

  async function single(i: ChatInputCommandInteraction, id: number, amount: number | null) {
    await i.deferReply();
    const labels = labelsOf(await listSeedTypes(deps.db));
    if (amount !== null) {
      const r = await removeSeeds(deps.db, id, amount);
      if (!r) {
        await i.editReply({ content: `Няма партида #${id}.`, allowedMentions: NO_PINGS });
        return;
      }
      const name = `**${seedLabel(labels, r.batch.seedTypeKey)}** #${r.batch.id}`;
      await i.editReply({
        content:
          r.kind === 'partial'
            ? `Махнати ${r.removed} бр. от ${name} — остават ×${r.batch.count}.`
            : `Изтрита партида ${name} ×${r.batch.count} (махнати всички).`,
        allowedMentions: NO_PINGS,
      });
      return;
    }
    const removed = await deleteBatch(deps.db, id);
    await i.editReply({
      content: removed
        ? `Изтрита партида **${seedLabel(labels, removed.seedTypeKey)}** #${removed.id} ×${removed.count}.`
        : `Няма партида #${id}.`,
      allowedMentions: NO_PINGS,
    });
  }

  async function command(i: ChatInputCommandInteraction) {
    if (!(await ensureManager(deps.db, i))) return;
    const rawId = i.options.getInteger(OPTION_BATCH);
    const amount = i.options.getInteger(OPTION_COUNT);
    if (rawId !== null) {
      const id = idParamSchema.safeParse(rawId);
      if (!id.success) {
        await i.reply({ content: 'Няма такава партида.', flags: MessageFlags.Ephemeral });
        return;
      }
      await single(i, id.data, amount);
      return;
    }
    if (amount !== null) {
      await i.reply({
        content: '`брой` маха семки от една партида — избери и `партида`.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    // Без номер — менюто; с вид — само неговите партиди, всички отметнати.
    const type = seedKeySchema.safeParse(i.options.getString(OPTION_TYPE));
    const [types, all] = await Promise.all([listSeedTypes(deps.db), listBatches(deps.db)]);
    const batches = type.success ? all.filter((b) => b.seedTypeKey === type.data) : all;
    if (batches.length === 0) {
      await i.reply({ content: 'Няма партиди за триене.', flags: MessageFlags.Ephemeral });
      return;
    }
    const shownIds = menuBatches(batches).map((b) => b.id);
    const preselect = type.success ? shownIds : [];
    const token = pending.create(i.user.id, shownIds, preselect);
    await i.reply({
      ...buildRemovalMenu(batches, labelsOf(types), deps.now(), token, preselect),
      flags: MessageFlags.Ephemeral,
    });
  }

  async function onSelect(i: StringSelectMenuInteraction, token: string) {
    const ids = i.values.map(Number).filter((n) => Number.isInteger(n));
    if (!pending.select(token, i.user.id, ids)) {
      await i.update(expired);
      return;
    }
    const item = pending.get(token, i.user.id);
    const [types, all] = await Promise.all([listSeedTypes(deps.db), listBatches(deps.db)]);
    const batches = all.filter((b) => item?.options.includes(b.id));
    await i.update(
      buildRemovalMenu(batches, labelsOf(types), deps.now(), token, item?.selected ?? []),
    );
  }

  async function onConfirm(i: ButtonInteraction, token: string) {
    // Правото се проверява наново при натискането — ролята може да е махната междувременно.
    if (!pending.get(token, i.user.id)) {
      await i.update(expired);
      return;
    }
    if (!(await ensureManager(deps.db, i))) return;
    const item = pending.take(token, i.user.id);
    if (!item || item.selected.length === 0) {
      await i.update(expired);
      return;
    }
    await i.deferUpdate();
    const [types, removed] = await Promise.all([
      listSeedTypes(deps.db),
      deleteBatches(deps.db, item.selected),
    ]);
    const labels = labelsOf(types);
    await i.editReply({ content: `Изтрити партиди: ${removed.length}.`, components: [] });
    if (removed.length > 0) {
      const list = removed
        .map((b) => `${seedLabel(labels, b.seedTypeKey)} #${b.id} ×${b.count}`)
        .join(', ');
      // Видимо за всички в канала, както триенето на една партида.
      await i.followUp({
        content: `${actorName(i)} изтри ${removed.length} партиди: ${list}.`.slice(0, 2000),
        allowedMentions: NO_PINGS,
      });
    }
  }

  // Компонент от менюто: true — обработен тук.
  async function component(i: StringSelectMenuInteraction | ButtonInteraction): Promise<boolean> {
    const [prefix, action, token] = i.customId.split(':');
    if (prefix !== REMOVE_PREFIX || !token) return false;
    if (action === 'sel' && i.isStringSelectMenu()) await onSelect(i, token);
    else if (action === 'go' && i.isButton()) await onConfirm(i, token);
    else if (action === 'no' && i.isButton()) {
      pending.take(token, i.user.id);
      await i.update({ content: 'Отказано — нищо не е изтрито.', components: [] });
    } else return false;
    return true;
  }

  return { command, component };
}
