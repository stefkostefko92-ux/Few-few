// Обработката на slash командите и автокомплийта.
import {
  MessageFlags,
  PermissionFlagsBits,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  type Interaction,
} from 'discord.js';
import type { PrismaClient } from '@prisma/client';
import { canManageSeeds, type MemberFacts } from '../domain/access.js';
import { msLeft, percentAt } from '../domain/decay.js';
import {
  batchStatus,
  buildInfoMessages,
  formatDuration,
  formatPercent,
  formatThreshold,
  seedLabel,
} from '../domain/messages.js';
import { isSeedKey } from '../domain/seeds.js';
import { batchCreateSchema, idParamSchema, seedKeySchema } from '../domain/validation.js';
import type { Logger } from '../log.js';
import { createBatch, deleteBatch, listBatches, listSeedTypes } from '../services/batches.js';
import { labelsOf } from '../services/mapping.js';
import { getSettings } from '../services/rules.js';
import {
  CMD_DELETE,
  CMD_INFO,
  OPTION_BATCH,
  OPTION_COUNT,
  OPTION_PERCENT,
  OPTION_TYPE,
} from './commands.js';

export interface InteractionDeps {
  db: PrismaClient;
  log: Logger;
  guildId: string;
  now?: () => Date;
}

const NO_PINGS = { parse: [] } as const;

function memberFacts(i: ChatInputCommandInteraction | AutocompleteInteraction): MemberFacts | null {
  if (!i.inGuild()) return null;
  const roles = i.member.roles;
  return {
    isOwner: i.guild?.ownerId === i.user.id,
    isAdmin: i.memberPermissions.has(PermissionFlagsBits.Administrator),
    roleIds: Array.isArray(roles) ? roles : [...roles.cache.keys()],
  };
}

function actorName(i: ChatInputCommandInteraction): string {
  if (i.inCachedGuild()) return i.member.displayName;
  return i.user.globalName ?? i.user.username;
}

export function createInteractionHandler(deps: InteractionDeps) {
  const now = deps.now ?? (() => new Date());

  async function ensureManager(i: ChatInputCommandInteraction): Promise<boolean> {
    const settings = await getSettings(deps.db);
    if (canManageSeeds(memberFacts(i), settings.commandRoleId)) return true;
    const need = settings.commandRoleId ? `ролята <@&${settings.commandRoleId}>` : 'администратор';
    await i.reply({
      content: `Нямаш права за тази команда — нужна е ${need}.`,
      flags: MessageFlags.Ephemeral,
      allowedMentions: NO_PINGS,
    });
    return false;
  }

  async function addBatch(i: ChatInputCommandInteraction) {
    if (!(await ensureManager(i))) return;
    const parsed = batchCreateSchema.safeParse({
      seedTypeKey: i.commandName,
      count: i.options.getInteger(OPTION_COUNT, true),
      percent: i.options.getNumber(OPTION_PERCENT, true),
    });
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? 'Невалидни данни';
      await i.reply({ content: message, flags: MessageFlags.Ephemeral });
      return;
    }
    const at = now();
    const { batch, passed } = await createBatch(
      deps.db,
      parsed.data,
      { id: i.user.id, name: actorName(i) },
      'command',
      at,
    );
    const labels = labelsOf(await listSeedTypes(deps.db));
    const lines = [
      `Добавена партида **${seedLabel(labels, batch.seedTypeKey)}** #${batch.id} ${batchStatus(batch, at)}`,
    ];
    if (passed.length > 0) {
      const list = [...new Set(passed.map((r) => formatThreshold(r.kind, r.threshold)))].join(', ');
      lines.push(`Вече е под праг ${list} — за тях няма да има пинг.`);
    }
    await i.reply({ content: lines.join('\n'), allowedMentions: NO_PINGS });
  }

  async function info(i: ChatInputCommandInteraction) {
    const filter = i.options.getString(OPTION_TYPE);
    const key = filter ? seedKeySchema.safeParse(filter) : null;
    const [types, all] = await Promise.all([listSeedTypes(deps.db), listBatches(deps.db)]);
    const batches = key?.success ? all.filter((b) => b.seedTypeKey === key.data) : all;
    const [first, ...rest] = buildInfoMessages(batches, labelsOf(types), now());
    await i.reply({ content: first ?? 'Няма въведени семки.', allowedMentions: NO_PINGS });
    for (const content of rest) await i.followUp({ content, allowedMentions: NO_PINGS });
  }

  async function remove(i: ChatInputCommandInteraction) {
    if (!(await ensureManager(i))) return;
    const id = idParamSchema.safeParse(i.options.getInteger(OPTION_BATCH, true));
    const removed = id.success ? await deleteBatch(deps.db, id.data) : null;
    if (!removed) {
      await i.reply({ content: 'Няма такава партида.', flags: MessageFlags.Ephemeral });
      return;
    }
    const labels = labelsOf(await listSeedTypes(deps.db));
    await i.reply({
      content: `Изтрита партида **${seedLabel(labels, removed.seedTypeKey)}** #${removed.id} ×${removed.count}.`,
      allowedMentions: NO_PINGS,
    });
  }

  async function autocomplete(i: AutocompleteInteraction) {
    if (i.commandName !== CMD_DELETE) return i.respond([]);
    const query = String(i.options.getFocused()).trim().toLowerCase().replace(/^#/, '');
    const at = now();
    const [types, batches] = await Promise.all([listSeedTypes(deps.db), listBatches(deps.db)]);
    const labels = labelsOf(types);
    const choices = batches
      .map((b) => {
        const left = msLeft(b, b.rate, at);
        const name =
          `#${b.id} ${seedLabel(labels, b.seedTypeKey)} ×${b.count} · ` +
          `${formatPercent(percentAt(b, b.rate, at))} · ${left > 0 ? formatDuration(left) : 'изтекла'}`;
        return { name: name.slice(0, 100), value: b.id };
      })
      .filter((c) => !query || c.name.toLowerCase().includes(query))
      .slice(0, 25);
    await i.respond(choices);
  }

  async function handle(interaction: Interaction) {
    if (interaction.isAutocomplete()) {
      if (interaction.guildId !== deps.guildId) return interaction.respond([]);
      return autocomplete(interaction);
    }
    if (!interaction.isChatInputCommand()) return;
    if (interaction.guildId !== deps.guildId) {
      await interaction.reply({
        content: 'Командите работят само в сървъра, за който е настроен ботът.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const name = interaction.commandName;
    if (isSeedKey(name)) return addBatch(interaction);
    if (name === CMD_INFO) return info(interaction);
    if (name === CMD_DELETE) return remove(interaction);
  }

  // Грешка в една команда не сваля бота: логва се и потребителят вижда кратко съобщение.
  return async function onInteraction(interaction: Interaction): Promise<void> {
    try {
      await handle(interaction);
    } catch (err) {
      deps.log.error({ err, kind: interaction.type }, 'командата се провали');
      if (!interaction.isChatInputCommand()) return;
      const reply = {
        content: 'Нещо се обърка — опитай пак.',
        flags: MessageFlags.Ephemeral,
      } as const;
      try {
        if (interaction.replied || interaction.deferred) await interaction.followUp(reply);
        else await interaction.reply(reply);
      } catch (replyErr) {
        deps.log.warn({ err: replyErr }, 'отговорът за грешката не мина');
      }
    }
  };
}
