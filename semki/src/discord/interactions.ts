// Обработката на slash командите, автокомплийта и компонентите (менюто за триене).
import {
  MessageFlags,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  type Interaction,
} from 'discord.js';
import type { PrismaClient } from '@prisma/client';
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
import { batchCreateSchema, seedKeySchema } from '../domain/validation.js';
import type { Logger } from '../log.js';
import { createBatch, listBatches, listSeedTypes } from '../services/batches.js';
import { labelsOf } from '../services/mapping.js';
import { CMD_DELETE, CMD_INFO, OPTION_COUNT, OPTION_PERCENT, OPTION_TYPE } from './commands.js';
import { actorName, ensureManager, NO_PINGS } from './common.js';
import { createRemoveFlow } from './remove-flow.js';

export interface InteractionDeps {
  db: PrismaClient;
  log: Logger;
  guildId: string;
  now?: () => Date;
}

export function createInteractionHandler(deps: InteractionDeps) {
  const now = deps.now ?? (() => new Date());
  const removal = createRemoveFlow({ db: deps.db, now });

  async function addBatch(i: ChatInputCommandInteraction) {
    if (!(await ensureManager(deps.db, i))) return;
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
    // Отговорът се отлага, щом правата и входът са проверени: записът и текстът не бързат за 3-те секунди.
    await i.deferReply();
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
    await i.editReply({ content: lines.join('\n'), allowedMentions: NO_PINGS });
  }

  async function info(i: ChatInputCommandInteraction) {
    await i.deferReply();
    const filter = i.options.getString(OPTION_TYPE);
    const key = filter ? seedKeySchema.safeParse(filter) : null;
    const [types, all] = await Promise.all([listSeedTypes(deps.db), listBatches(deps.db)]);
    const batches = key?.success ? all.filter((b) => b.seedTypeKey === key.data) : all;
    const [first, ...rest] = buildInfoMessages(batches, labelsOf(types), now());
    await i.editReply({ content: first ?? 'Няма въведени семки.', allowedMentions: NO_PINGS });
    for (const content of rest) await i.followUp({ content, allowedMentions: NO_PINGS });
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
      // Само цифри — по номера на партидата (иначе „12“ хваща и „87,12%“); иначе — по текста.
      .filter((c) =>
        /^\d+$/.test(query)
          ? String(c.value).startsWith(query)
          : !query || c.name.toLowerCase().includes(query),
      )
      .slice(0, 25);
    await i.respond(choices);
  }

  async function handle(interaction: Interaction) {
    if (interaction.isAutocomplete()) {
      if (interaction.guildId !== deps.guildId) return interaction.respond([]);
      return autocomplete(interaction);
    }
    if (interaction.isStringSelectMenu() || interaction.isButton()) {
      if (interaction.guildId !== deps.guildId) return;
      await removal.component(interaction);
      return;
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
    if (name === CMD_DELETE) return removal.command(interaction);
  }

  // Грешка в една команда не сваля бота: логва се и потребителят вижда кратко съобщение.
  return async function onInteraction(interaction: Interaction): Promise<void> {
    try {
      await handle(interaction);
    } catch (err) {
      deps.log.error({ err, kind: interaction.type }, 'командата се провали');
      if (!interaction.isRepliable()) return;
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
