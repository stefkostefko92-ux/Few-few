import { parseCosmetic, type Cosmetic, type CosmeticType, type GameKey } from "@aso/shared";
import { useCosmeticsStore } from "../../lib/store";

/**
 * The cosmetic the player has equipped in a given game's slot (felt / card back
 * / board), or undefined. Reads the equipped-id list published into the store
 * after sign-in and on each equip.
 */
export function useEquippedCosmetic(
  game: GameKey | null | undefined,
  type: CosmeticType,
): Cosmetic | undefined {
  const equipped = useCosmeticsStore((s) => s.equipped);
  if (!game) return undefined;
  const prefix = `${game}.${type}.`;
  const id = equipped.find((e) => e.startsWith(prefix));
  return id ? parseCosmetic(id) : undefined;
}
