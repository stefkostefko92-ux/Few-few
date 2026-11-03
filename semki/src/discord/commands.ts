// Дефинициите на slash командите. Регистрират се само в нашата гилдия (появяват се веднага).
import {
  InteractionContextType,
  REST,
  Routes,
  SlashCommandBuilder,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
} from 'discord.js';
import { SEED_DEFAULT_LABELS, SEED_KEYS } from '../domain/seeds.js';
import { MAX_COUNT } from '../domain/validation.js';

export const OPTION_COUNT = 'брой';
export const OPTION_PERCENT = 'дюрейшън';
export const OPTION_TYPE = 'вид';
export const OPTION_BATCH = 'партида';
export const CMD_INFO = 'infosemki';
export const CMD_DELETE = 'iztriisemki';

export function buildCommands(): RESTPostAPIChatInputApplicationCommandsJSONBody[] {
  const seedCommands = SEED_KEYS.map((key) =>
    new SlashCommandBuilder()
      .setName(key)
      .setDescription(`Добави партида ${SEED_DEFAULT_LABELS[key]} (брой и текущ % трайност)`)
      .setContexts(InteractionContextType.Guild)
      .addIntegerOption((o) =>
        o
          .setName(OPTION_COUNT)
          .setDescription('Колко семки')
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(MAX_COUNT),
      )
      .addNumberOption((o) =>
        o
          .setName(OPTION_PERCENT)
          .setDescription('Текущ % трайност, от 0 до 100 (напр. 87.4)')
          .setRequired(true)
          .setMinValue(0)
          .setMaxValue(100),
      )
      .toJSON(),
  );

  const info = new SlashCommandBuilder()
    .setName(CMD_INFO)
    .setDescription('Всички въведени семки: % трайност и колко време им остава')
    .setContexts(InteractionContextType.Guild)
    .addStringOption((o) =>
      o
        .setName(OPTION_TYPE)
        .setDescription('Само един вид')
        .setRequired(false)
        .addChoices(...SEED_KEYS.map((key) => ({ name: SEED_DEFAULT_LABELS[key], value: key }))),
    )
    .toJSON();

  const remove = new SlashCommandBuilder()
    .setName(CMD_DELETE)
    .setDescription('Изтрий партида семки (засадени, продадени или изтекли)')
    .setContexts(InteractionContextType.Guild)
    .addIntegerOption((o) =>
      o
        .setName(OPTION_BATCH)
        .setDescription('Номерът на партидата (#)')
        .setRequired(true)
        .setMinValue(1)
        .setAutocomplete(true),
    )
    .toJSON();

  return [...seedCommands, info, remove];
}

export async function registerGuildCommands(
  token: string,
  clientId: string,
  guildId: string,
): Promise<number> {
  const rest = new REST({ version: '10' }).setToken(token);
  const body = buildCommands();
  await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body });
  return body.length;
}
