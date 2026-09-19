// backend/src/lib/game/companions.js
// v50 — Server Season, етап 2: КАТАЛОГЪТ на спътниците. Чист модул (без база,
// без Discord) — четат го backend маршрутите, генераторът на картинки
// (frontend/scripts/companions-art.mjs) и гейтовете.
//
// Спътниците са оригинални: 60 варианта на маскота на Carbon Stealth
// (желирано телце с очила и академична шапка — mascot/), пребоядисани САМО
// през токените `--jm-*` (правилото на mascot/README.md: никакви CSS филтри) и с
// различно изражение по форма (1 = neutral, 2 = happy, 3 = celebrate).
// Никаква чужда IP. Картинките са предварително растеризирани в
// frontend/public/game/companions/<id>-<stage>.jpg (Discord embed-ите не
// рендерират SVG); генераторът е детерминистичен от този файл.
//
// Редкост: common 60 % · uncommon 25 % · rare 10 % · epic 4 % · legendary 1 %
// (тегла при поява). Free сървър: появяват се само common/uncommon (concept §5).

export const RARITIES = Object.freeze({
  common:    { key: "common",    label: "Common",    weight: 60, ring: "#6b7280", emoji: "⚪" },
  uncommon:  { key: "uncommon",  label: "Uncommon",  weight: 25, ring: "#5AB60D", emoji: "🟢" },
  rare:      { key: "rare",      label: "Rare",      weight: 10, ring: "#2588c5", emoji: "🔵" },
  epic:      { key: "epic",      label: "Epic",      weight: 4,  ring: "#8b5cf6", emoji: "🟣" },
  legendary: { key: "legendary", label: "Legendary", weight: 1,  ring: "#D9A521", emoji: "🟡" },
});
export const FREE_RARITIES = Object.freeze(["common", "uncommon"]);

/** Искри, вложени за да стигнеш форма 2 и форма 3. */
export const STAGE_THRESHOLDS = Object.freeze([0, 100, 300]);
export const MAX_STAGE = 3;
export const STAGE_EXPRESSION = Object.freeze({ 1: "neutral", 2: "happy", 3: "celebrate" });

/** Поява: колко време стои „Улови" бутонът и минималният интервал между появи в сървър. */
export const SPAWN_TTL_MS = 5 * 60 * 1000;
export const SPAWN_MIN_INTERVAL_MS = 12 * 60 * 1000;
export const SPAWN_MIN_MESSAGES = 6;      // толкова XP събития след последната поява
export const SPAWN_CHANCE = 1 / 25;       // шанс на XP събитие след прага

// ─── Палитри: 12 семейства, всяко = пет тона на тялото (pale/olive/neon/bottle/deep) ──
// Стойностите са в същата светлинна структура като оригинала (светло → дълбоко),
// за да оцелее обемът на желето; сменя се само оттенъкът/наситеността.
const FAMILIES = [
  { key: "lime",    name: "Lime",    pale: "#C8DDA6", olive: "#99E72A", neon: "#5AB60D", bottle: "#297F04", deep: "#0D4A02" },
  { key: "teal",    name: "Teal",    pale: "#B9E8E2", olive: "#2AE7D8", neon: "#0DB6A8", bottle: "#04737F", deep: "#023A4A" },
  { key: "violet",  name: "Violet",  pale: "#D9CBEF", olive: "#B48BFF", neon: "#7C4DDB", bottle: "#4B2A96", deep: "#241247" },
  { key: "amber",   name: "Amber",   pale: "#F1E1B0", olive: "#F5C842", neon: "#D9961A", bottle: "#8C5A08", deep: "#4A2E03" },
  { key: "rose",    name: "Rose",    pale: "#F3C9D6", olive: "#FF7FA8", neon: "#E0407A", bottle: "#8F1F4B", deep: "#4A0E27" },
  { key: "ice",     name: "Ice",     pale: "#DDEFF8", olive: "#9ED8FF", neon: "#4FA8E8", bottle: "#1F5F9C", deep: "#0E2F52" },
  { key: "ember",   name: "Ember",   pale: "#F5D2B8", olive: "#FF9A4D", neon: "#E85D1C", bottle: "#8F2E0A", deep: "#4A1404" },
  { key: "shadow",  name: "Shadow",  pale: "#C9CBD3", olive: "#9AA0B4", neon: "#5C6478", bottle: "#2E3444", deep: "#141824" },
  { key: "coral",   name: "Coral",   pale: "#F8D4CB", olive: "#FF9B8A", neon: "#F26350", bottle: "#9C2E22", deep: "#4F150F" },
  { key: "gold",    name: "Gold",    pale: "#F7ECC4", olive: "#F2D479", neon: "#D9A521", bottle: "#8A6410", deep: "#4A3506" },
  { key: "mint",    name: "Mint",    pale: "#D2F1E0", olive: "#7BE8B0", neon: "#2FC77C", bottle: "#127B4A", deep: "#064226" },
  { key: "cobalt",  name: "Cobalt",  pale: "#C9D3F5", olive: "#7C93FF", neon: "#3A57D9", bottle: "#1F2F8F", deep: "#0E1748" },
];

// 60 оригинални имена — по 5 на семейство, подредени по редкост:
// [common, common, uncommon, rare, epic] за първите 12 = 24 common, 12 uncommon,
// 12 rare, 12 epic → после преразпределяме, за да стане 24/16/12/6/2 (виж build).
const NAMES = [
  ["Blip", "Wobble", "Pip", "Glimmer", "Luminel"],
  ["Splash", "Ripple", "Marlo", "Tidebrook", "Abyssara"],
  ["Nib", "Plum", "Vesper", "Nocturne", "Violetta"],
  ["Honey", "Butter", "Saffron", "Emberlyn", "Solstice"],
  ["Petal", "Blush", "Rosalie", "Camellia", "Aurorine"],
  ["Frost", "Sleet", "Glacia", "Nimbus", "Borealis"],
  ["Spark", "Cinder", "Kindle", "Pyrelle", "Ignatius"],
  ["Dusk", "Murk", "Umbra", "Nightjar", "Eclipsa"],
  ["Coralie", "Reefy", "Marisol", "Lagoona", "Tidewell"],
  ["Nugget", "Ducat", "Aurum", "Gilda", "Midas"],
  ["Sprout", "Clover", "Fernly", "Verdanta", "Sylvane"],
  ["Dot", "Bolt", "Azuro", "Cobaltine", "Stellaris"],
];

// Редкост по позиция във всяка петорка, после корекция за точните бройки.
const SLOT_RARITY = ["common", "common", "uncommon", "rare", "epic"];
// Кои семейства дават legendary (петият слот става legendary) и кои rare/epic слизат
// с една стъпка, за да излязат 24/16/12/6/2.
const LEGENDARY_FAMILIES = new Set(["gold", "cobalt"]);       // 2 legendary
const EPIC_TO_RARE = new Set(["lime", "teal", "amber", "rose"]); // 4 epic → rare  (epic: 12-2-4 = 6)
const RARE_TO_UNCOMMON = new Set(["lime", "violet", "ice", "shadow"]); // 4 rare → uncommon

/**
 * Сезонът по подразбиране — САМО seed за първото четене (lib/game/seasons.js
 * го записва в game_seasons, ако таблицата е празна). Живият сезон се управлява
 * от админ конзолата (Season), не оттук. Сезонни: двата legendary + два epic.
 */
export const DEFAULT_SEASON = Object.freeze({
  code: "S1",
  name: "Season 1 — First Light",
  startsAt: "2026-09-21T00:00:00Z",
  endsAt: "2026-12-14T00:00:00Z",
  companionIds: Object.freeze(["gold-midas", "cobalt-stellaris", "ember-ignatius", "shadow-eclipsa"]),
});

function build() {
  const list = [];
  FAMILIES.forEach((fam, fi) => {
    NAMES[fi].forEach((name, si) => {
      let rarity = SLOT_RARITY[si];
      if (si === 4 && LEGENDARY_FAMILIES.has(fam.key)) rarity = "legendary";
      else if (si === 4 && EPIC_TO_RARE.has(fam.key)) rarity = "rare";
      if (si === 3 && RARE_TO_UNCOMMON.has(fam.key)) rarity = "uncommon";
      const id = `${fam.key}-${name.toLowerCase()}`;
      list.push({
        id, name, family: fam.key, familyName: fam.name, rarity,
        palette: { pale: fam.pale, olive: fam.olive, neon: fam.neon, bottle: fam.bottle, deep: fam.deep },
        blurb: blurbFor(name, fam.name, rarity),
      });
    });
  });
  return list;
}

function blurbFor(name, family, rarity) {
  const tone = { common: "a friendly", uncommon: "a curious", rare: "a rare", epic: "an extraordinary", legendary: "a legendary" }[rarity];
  return `${name} is ${tone} ${family.toLowerCase()} jelly with round glasses and a tiny graduation cap.`;
}

export const COMPANIONS = Object.freeze(build());
const BY_ID = new Map(COMPANIONS.map((c) => [c.id, c]));

export function companionById(id) {
  return BY_ID.get(id) || null;
}

export function rarityMeta(rarity) {
  return RARITIES[rarity] || RARITIES.common;
}

/** Формата за вложени искри: 1 при < 100, 2 при < 300, 3 иначе. */
export function stageForFed(fed) {
  let stage = 1;
  for (let i = 1; i < STAGE_THRESHOLDS.length; i++) if (fed >= STAGE_THRESHOLDS[i]) stage = i + 1;
  return Math.min(MAX_STAGE, stage);
}

/** Публичен URL на картинката (frontend nginx сервира /game/companions/*.jpg). */
export function imageUrl(id, stage = 1, base = process.env.FRONTEND_URL || "https://supremebot.carbonstealth.eu") {
  return `${String(base).replace(/\/$/, "")}/game/companions/${id}-${Math.max(1, Math.min(MAX_STAGE, stage))}.jpg`;
}

/** Активен ли е сезонът сега (между старта и края). Без сезон → не. */
export function seasonActive(now = new Date(), season = null) {
  if (!season) return false;
  return now >= new Date(season.startsAt) && now < new Date(season.endsAt);
}

/** Сезонен ли е спътникът в дадения сезон. */
export function isSeasonal(companionId, season = null) {
  return !!season && Array.isArray(season.companionIds) && season.companionIds.includes(companionId);
}

/**
 * Избира спътник за поява: първо редкост по тегло (Free: само common/uncommon),
 * после равномерно между спътниците с тази редкост. Сезонните (по `season`) се
 * появяват само докато сезонът е активен; без подаден сезон — никога (fail-closed).
 * `rand` е инжектируем за тестове.
 */
export function pickSpawn({ isPremium = false, now = new Date(), rand = Math.random, season = null } = {}) {
  const allowed = Object.values(RARITIES).filter((r) => isPremium || FREE_RARITIES.includes(r.key));
  const total = allowed.reduce((s, r) => s + r.weight, 0);
  let roll = rand() * total;
  let rarity = allowed[allowed.length - 1].key;
  for (const r of allowed) { if (roll < r.weight) { rarity = r.key; break; } roll -= r.weight; }
  // Извън сезона сезонните НЕ се появяват. Ако цялата редкост е сезонна (двата
  // legendary в S1), слизаме една редкост надолу — common никога не е сезонен.
  const active = seasonActive(now, season);
  const order = ["legendary", "epic", "rare", "uncommon", "common"];
  let pool = [];
  for (let i = order.indexOf(rarity); i < order.length && !pool.length; i++) {
    pool = COMPANIONS.filter((c) => c.rarity === order[i] && (active || !isSeasonal(c.id, season)));
  }
  return pool[Math.floor(rand() * pool.length)];
}

/** Публичните полета за API/embed. `seasonId` = кодът на сезона, ако спътникът е сезонен в него. */
export function publicCompanion(c, stage = 1, season = null) {
  if (!c) return null;
  const r = rarityMeta(c.rarity);
  return { id: c.id, name: c.name, family: c.familyName, rarity: c.rarity, rarityLabel: r.label, rarityEmoji: r.emoji, ring: r.ring, seasonId: isSeasonal(c.id, season) ? season.code : null, blurb: c.blurb, imageUrl: imageUrl(c.id, stage) };
}
