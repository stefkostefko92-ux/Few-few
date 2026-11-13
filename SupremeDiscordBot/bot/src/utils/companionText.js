// bot/src/utils/companionText.js
// Текстовете на спътника на езика на сървъра: редкост, семейство и описание.
// Каталогът (backend/src/lib/game/companions.js) е на английски — картата на
// `/companion info` излизаше наполовина на английски („Common“, „Ember“ и
// описанието; преглед 10.10.2026). Преводите са в i18n; при непознат ключ
// остава английският текст от каталога, за да не излезе празно поле.
import { t as baseT } from "../i18n/index.js";

export const RARITY_KEYS = Object.freeze(["common", "uncommon", "rare", "epic", "legendary"]);
export const FAMILY_KEYS = Object.freeze(["lime", "teal", "violet", "amber", "rose", "ice", "ember", "shadow", "coral", "gold", "mint", "cobalt"]);

// `familyKey` идва от backend-а; по-старите отговори го нямат — тогава от
// каталожния id („ember-spark“ → ember).
function familyKeyOf(c) {
  const k = c?.familyKey || String(c?.companionId || "").split("-")[0];
  return FAMILY_KEYS.includes(k) ? k : null;
}

export function rarityName(c, lang, t = baseT) {
  return RARITY_KEYS.includes(c?.rarity) ? t(`game.rarity.${c.rarity}`, lang) : (c?.rarityLabel || "");
}

export function familyName(c, lang, t = baseT) {
  const k = familyKeyOf(c);
  return k ? t(`game.family.${k}`, lang) : (c?.family || "");
}

export function companionBlurb(c, lang, t = baseT) {
  if (!RARITY_KEYS.includes(c?.rarity) || !familyKeyOf(c)) return c?.blurb || "";
  return t("game.companion.blurb", lang, { name: c.name, tone: t(`game.companion.tone.${c.rarity}`, lang), family: familyName(c, lang, t) });
}
