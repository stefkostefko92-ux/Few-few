import i18n from "../i18n";

/**
 * Ботовете идват от сървъра като „Бот 1“, „Бот 2“… (номерирани по реда на
 * местата). Тук името се показва на езика на играча („Bot 1“ на EN/IT), като
 * номерът е същият — по реда на местата сред ботовете.
 */
export function localizeBots<T extends { seat: number; isBot: boolean; displayName: string }>(players: readonly T[]): T[] {
  const order = new Map<number, number>();
  let n = 0;
  for (const p of [...players].sort((a, b) => a.seat - b.seat)) if (p.isBot) order.set(p.seat, ++n);
  return players.map((p) => (p.isBot ? { ...p, displayName: i18n.t("game.botName", { n: order.get(p.seat) }) } : p));
}
