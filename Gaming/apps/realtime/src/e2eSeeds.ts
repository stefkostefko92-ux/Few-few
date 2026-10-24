import { isGameKey, type GameKey } from "@aso/shared";

/**
 * Фиксирани seed-ове по игра — САМО за изолирания браузърен стек
 * (`infra/e2e-games.sh`). Формат: `SANTASE=e2e-santase-5159,KENT=e2e-kent-411`.
 *
 * С фиксиран seed раздаванията са едни и същи (ботовете също са със seed-ове,
 * производни от него), затова e2e тестът стига детерминистично до всяко
 * действие на играта — размяна на коза, контра/реконтра, тайния знак в Кент —
 * вместо да разчита на късмета на раздаването.
 *
 * В продукция се игнорира ВИНАГИ: там seed-ът е криптографски случаен и е част
 * от доказуемата честност на раздаването.
 */
export function parseE2eSeeds(
  raw: string | undefined,
  isProd: boolean,
): ReadonlyMap<GameKey, string> {
  const seeds = new Map<GameKey, string>();
  if (!raw || isProd) return seeds;
  for (const part of raw.split(",")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const game = part.slice(0, eq).trim();
    const seed = part.slice(eq + 1).trim();
    if (seed && isGameKey(game)) seeds.set(game, seed);
  }
  return seeds;
}
