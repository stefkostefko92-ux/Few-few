/* ============================================================
 *  Realms of Tanoth — a single-page browser RPG
 *  All state lives in `S` and is persisted to localStorage.
 * ============================================================ */

"use strict";

const SAVE_KEY = "tanoth.save.v1";

/* ---------- Data: Classes ---------- */
const CLASSES = {
  warrior: {
    name: "Warrior",
    base: { str: 8, dex: 5, con: 7, int: 3 },
    hpPerCon: 12,
    mpPerInt: 4,
    weaponType: "melee",
    skill: { name: "Cleave", cost: 6, mult: 1.8, desc: "A sweeping strike for 180% weapon damage." },
  },
  ranger: {
    name: "Ranger",
    base: { str: 5, dex: 8, con: 5, int: 4 },
    hpPerCon: 10,
    mpPerInt: 5,
    weaponType: "ranged",
    skill: { name: "Aimed Shot", cost: 5, mult: 1.6, critBonus: 0.4, desc: "A precise shot with +40% crit chance." },
  },
  mage: {
    name: "Mage",
    base: { str: 3, dex: 5, con: 4, int: 9 },
    hpPerCon: 8,
    mpPerInt: 8,
    weaponType: "magic",
    skill: { name: "Firebolt", cost: 8, mult: 2.2, desc: "A bolt of flame dealing 220% magic damage." },
  },
};

/* ---------- Data: Items ---------- */
const ITEMS = [
  // Weapons
  { id: "w_dagger",   name: "Rusty Dagger",    slot: "weapon", type: "melee",  atk: 2,  price: 15,  rarity: "common"   },
  { id: "w_sword",    name: "Iron Sword",      slot: "weapon", type: "melee",  atk: 6,  price: 80,  rarity: "common"   },
  { id: "w_axe",      name: "Steel Battleaxe", slot: "weapon", type: "melee",  atk: 12, price: 240, rarity: "uncommon" },
  { id: "w_claymore", name: "Silver Claymore", slot: "weapon", type: "melee",  atk: 22, price: 720, rarity: "rare"     },
  { id: "w_bow",      name: "Hunter's Bow",    slot: "weapon", type: "ranged", atk: 5,  price: 70,  rarity: "common"   },
  { id: "w_longbow",  name: "Yew Longbow",     slot: "weapon", type: "ranged", atk: 11, price: 220, rarity: "uncommon" },
  { id: "w_elvenbow", name: "Elven Recurve",   slot: "weapon", type: "ranged", atk: 20, price: 680, rarity: "rare"     },
  { id: "w_staff",    name: "Apprentice Staff",slot: "weapon", type: "magic",  atk: 5,  price: 70,  rarity: "common"   },
  { id: "w_rod",      name: "Runed Rod",       slot: "weapon", type: "magic",  atk: 11, price: 220, rarity: "uncommon" },
  { id: "w_archstaff",name: "Archmage Staff",  slot: "weapon", type: "magic",  atk: 21, price: 700, rarity: "rare"     },

  // Armor (chest)
  { id: "a_rags",     name: "Tattered Rags",   slot: "armor", def: 1,  price: 10,  rarity: "common"   },
  { id: "a_leather",  name: "Leather Tunic",   slot: "armor", def: 4,  price: 60,  rarity: "common"   },
  { id: "a_chain",    name: "Chain Hauberk",   slot: "armor", def: 9,  price: 200, rarity: "uncommon" },
  { id: "a_plate",    name: "Knight's Plate",  slot: "armor", def: 16, price: 600, rarity: "rare"     },
  { id: "a_dragon",   name: "Dragonscale Mail",slot: "armor", def: 26, price: 1800,rarity: "epic"     },

  // Helms
  { id: "h_hood",     name: "Cloth Hood",      slot: "helm", def: 1, price: 20,  rarity: "common"   },
  { id: "h_cap",      name: "Leather Cap",     slot: "helm", def: 3, price: 50,  rarity: "common"   },
  { id: "h_helm",     name: "Iron Helm",       slot: "helm", def: 6, price: 160, rarity: "uncommon" },
  { id: "h_crown",    name: "Runed Circlet",   slot: "helm", def: 10,price: 500, rarity: "rare", int: 2 },

  // Boots
  { id: "b_sandals",  name: "Worn Sandals",    slot: "boots", def: 1, price: 15,  rarity: "common"   },
  { id: "b_boots",    name: "Leather Boots",   slot: "boots", def: 2, price: 45,  rarity: "common", dex: 1 },
  { id: "b_greaves",  name: "Iron Greaves",    slot: "boots", def: 5, price: 150, rarity: "uncommon" },
  { id: "b_swift",    name: "Swiftstride Boots",slot:"boots", def: 7, price: 440, rarity: "rare", dex: 3 },

  // Rings / Trinkets
  { id: "r_iron",     name: "Iron Ring",       slot: "ring", str: 1, price: 80,  rarity: "common"   },
  { id: "r_silver",   name: "Silver Ring",     slot: "ring", str: 2, dex: 1, price: 220, rarity: "uncommon" },
  { id: "r_arcane",   name: "Arcane Band",     slot: "ring", int: 3, price: 320, rarity: "uncommon" },
  { id: "r_titan",    name: "Ring of Titans",  slot: "ring", str: 4, con: 2, price: 900, rarity: "rare" },

  // Consumables
  { id: "p_minor",    name: "Minor Healing Potion", slot: "potion", heal: 30,  price: 25, rarity: "common", stack: true },
  { id: "p_health",   name: "Healing Potion",       slot: "potion", heal: 75,  price: 60, rarity: "common", stack: true },
  { id: "p_greater",  name: "Greater Healing",      slot: "potion", heal: 180, price: 150,rarity: "uncommon", stack: true },
  { id: "p_mana",     name: "Mana Draught",         slot: "potion", mana: 40,  price: 50, rarity: "common", stack: true },
];

const ITEM_BY_ID = Object.fromEntries(ITEMS.map(i => [i.id, i]));

/* ---------- Data: Monsters ---------- */
const MONSTERS = [
  { id: "rat",     name: "Giant Rat",      lvl: 1,  hp: 18,  atk: 4,  def: 1,  xp: 8,  gold: [3, 8],   loot: ["p_minor"]            },
  { id: "wolf",    name: "Grey Wolf",      lvl: 2,  hp: 30,  atk: 7,  def: 2,  xp: 14, gold: [6, 14],  loot: ["p_minor","a_rags"]   },
  { id: "goblin",  name: "Goblin Scout",   lvl: 3,  hp: 42,  atk: 10, def: 3,  xp: 22, gold: [10,22],  loot: ["w_dagger","p_minor"] },
  { id: "bandit",  name: "Forest Bandit",  lvl: 5,  hp: 70,  atk: 14, def: 5,  xp: 38, gold: [20,40],  loot: ["w_sword","a_leather","p_health"] },
  { id: "orc",     name: "Orc Brute",      lvl: 7,  hp: 110, atk: 20, def: 7,  xp: 60, gold: [35,65],  loot: ["w_axe","a_chain","h_cap","p_health"] },
  { id: "troll",   name: "Cave Troll",     lvl: 10, hp: 180, atk: 28, def: 10, xp: 95, gold: [60,110], loot: ["w_axe","a_chain","h_helm","r_iron","p_greater"] },
  { id: "wraith",  name: "Bone Wraith",    lvl: 13, hp: 230, atk: 36, def: 12, xp: 140,gold: [90,160], loot: ["w_longbow","w_rod","r_silver","p_greater","p_mana"] },
  { id: "ogre",    name: "Mountain Ogre",  lvl: 16, hp: 320, atk: 48, def: 16, xp: 200,gold: [140,240],loot: ["w_claymore","a_plate","h_helm","b_greaves","p_greater"] },
  { id: "drake",   name: "Frost Drake",    lvl: 20, hp: 480, atk: 64, def: 22, xp: 320,gold: [240,400],loot: ["w_elvenbow","w_archstaff","a_plate","r_titan","h_crown","b_swift"] },
  { id: "wyrm",    name: "Ancient Wyrm",   lvl: 25, hp: 720, atk: 88, def: 30, xp: 520,gold: [400,700],loot: ["w_claymore","w_elvenbow","w_archstaff","a_dragon","r_titan","h_crown","b_swift"] },
];

/* ---------- Data: Adventures ---------- */
const ADVENTURES = [
  { id: "patrol",   name: "Patrol the Village",    duration: 15,  minLvl: 1,  reward: { xp: 12,  gold: [8,18]   } },
  { id: "rats",     name: "Clear the Cellar",      duration: 25,  minLvl: 1,  reward: { xp: 20,  gold: [12,28]  }, foe: "rat"    },
  { id: "wolves",   name: "Hunt the Grey Wolves",  duration: 45,  minLvl: 2,  reward: { xp: 38,  gold: [24,52]  }, foe: "wolf"   },
  { id: "goblins",  name: "Goblin Camp Raid",      duration: 90,  minLvl: 3,  reward: { xp: 75,  gold: [50,100] }, foe: "goblin" },
  { id: "bandits",  name: "Bandit Ambush",         duration: 150, minLvl: 5,  reward: { xp: 130, gold: [90,180] }, foe: "bandit" },
  { id: "orcs",     name: "Orc Warband",           duration: 240, minLvl: 7,  reward: { xp: 220, gold: [150,300]}, foe: "orc"    },
  { id: "trolls",   name: "Troll Caverns",         duration: 360, minLvl: 10, reward: { xp: 360, gold: [260,500]}, foe: "troll"  },
  { id: "wraiths",  name: "Haunted Crypt",         duration: 480, minLvl: 13, reward: { xp: 520, gold: [400,720]}, foe: "wraith" },
  { id: "ogres",    name: "Mountain Pass",         duration: 600, minLvl: 16, reward: { xp: 760, gold: [600,1000]},foe:"ogre"    },
  { id: "drake",    name: "Frost Peak Expedition", duration: 900, minLvl: 20, reward: { xp: 1200,gold: [950,1600]},foe:"drake"   },
];

/* ---------- Data: Tavern Quests ---------- */
const QUESTS = [
  { id: "q_rats",    name: "The Innkeeper's Pests", desc: "Slay 3 Giant Rats in the arena.",   target: { kill: "rat",    count: 3 }, reward: { xp: 30,  gold: 60  } },
  { id: "q_wolves",  name: "Wolves at the Door",    desc: "Slay 3 Grey Wolves in the arena.",  target: { kill: "wolf",   count: 3 }, reward: { xp: 60,  gold: 120 } },
  { id: "q_goblins", name: "Greenskin Menace",      desc: "Slay 3 Goblins in the arena.",      target: { kill: "goblin", count: 3 }, reward: { xp: 110, gold: 220 } },
  { id: "q_bandits", name: "Roadwarden's Bounty",   desc: "Slay 3 Forest Bandits.",            target: { kill: "bandit", count: 3 }, reward: { xp: 200, gold: 400 } },
  { id: "q_orcs",    name: "The Warchief's Head",   desc: "Slay 3 Orc Brutes.",                target: { kill: "orc",    count: 3 }, reward: { xp: 360, gold: 700 } },
];

/* ============================================================
 *   Game State
 * ============================================================ */

let S = null;

function newHero(name, klass) {
  const c = CLASSES[klass];
  return {
    name,
    klass,
    level: 1,
    xp: 0,
    gold: 25,
    str: c.base.str,
    dex: c.base.dex,
    con: c.base.con,
    int: c.base.int,
    statPoints: 0,
    hp: 0, mp: 0,     // filled by recompute
    inventory: [{ id: "p_minor", qty: 2 }],
    equip: { weapon: null, armor: null, helm: null, boots: null, ring: null },
    location: "town",
    adventure: null,  // { id, endsAt }
    quests: [],       // active quest ids
    kills: {},        // monsterId -> count
    log: [],
    createdAt: Date.now(),
  };
}

function xpToNext(level) { return 50 + Math.floor(40 * Math.pow(level, 1.6)); }

function effectiveStats() {
  let s = { str: S.str, dex: S.dex, con: S.con, int: S.int, atk: 0, def: 0 };
  for (const slot in S.equip) {
    const id = S.equip[slot];
    if (!id) continue;
    const it = ITEM_BY_ID[id];
    s.atk += it.atk || 0;
    s.def += it.def || 0;
    s.str += it.str || 0;
    s.dex += it.dex || 0;
    s.con += it.con || 0;
    s.int += it.int || 0;
  }
  const c = CLASSES[S.klass];
  // Weapon damage scales with the class' favored attribute
  const w = S.equip.weapon ? ITEM_BY_ID[S.equip.weapon] : null;
  let primary = s.str;
  if (c.weaponType === "ranged") primary = s.dex;
  if (c.weaponType === "magic")  primary = s.int;
  // Bonus damage from primary stat
  s.bonusDmg = Math.floor(primary * 0.6);
  s.maxHp = 20 + s.con * c.hpPerCon + (S.level - 1) * 8;
  s.maxMp = 10 + s.int * c.mpPerInt + (S.level - 1) * 3;
  s.critChance = 0.05 + s.dex * 0.005; // 0.5% per dex
  s.dodgeChance = Math.min(0.35, s.dex * 0.004);
  return s;
}

function recompute(clampPools = true) {
  const eff = effectiveStats();
  if (clampPools) {
    S.hp = Math.min(S.hp || eff.maxHp, eff.maxHp);
    S.mp = Math.min(S.mp || eff.maxMp, eff.maxMp);
    if (S.hp <= 0) S.hp = eff.maxHp;
  }
  return eff;
}

/* ============================================================
 *   Save / Load
 * ============================================================ */
function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(S));
    log("Game saved.", "info");
  } catch (e) {
    log("Save failed: " + e.message, "bad");
  }
}
function loadFromStorage() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); }
  catch { return null; }
}
function hasSave() { return !!localStorage.getItem(SAVE_KEY); }

/* ============================================================
 *   Logging
 * ============================================================ */
function log(text, kind = "info") {
  if (!S) return console.log(text);
  S.log.unshift({ text, kind, t: Date.now() });
  if (S.log.length > 60) S.log.length = 60;
  renderLog();
}
function renderLog() {
  const el = document.getElementById("log");
  if (!el || !S) return;
  el.innerHTML = S.log.map(e => `<div class="entry log-${e.kind}">${e.text}</div>`).join("");
}

/* ============================================================
 *   Inventory helpers
 * ============================================================ */
function addItem(id, qty = 1) {
  const it = ITEM_BY_ID[id];
  if (!it) return;
  if (it.stack) {
    const existing = S.inventory.find(s => s.id === id);
    if (existing) { existing.qty += qty; return; }
  }
  for (let i = 0; i < qty; i++) S.inventory.push({ id });
}
function removeItem(idx) { S.inventory.splice(idx, 1); }
function consumeItem(id) {
  for (let i = 0; i < S.inventory.length; i++) {
    if (S.inventory[i].id === id) {
      if (S.inventory[i].qty && S.inventory[i].qty > 1) S.inventory[i].qty--;
      else S.inventory.splice(i, 1);
      return true;
    }
  }
  return false;
}

/* ============================================================
 *   Combat
 * ============================================================ */
let CB = null; // active combat state

function startCombat(monsterId, onWin) {
  const m = MONSTERS.find(x => x.id === monsterId);
  if (!m) return;
  // Scale slightly with player level for fairness in adventures
  const scale = 1 + Math.max(0, S.level - m.lvl) * 0.02;
  CB = {
    foe: {
      ...m,
      hp: Math.floor(m.hp * scale),
      maxHp: Math.floor(m.hp * scale),
    },
    onWin,
    over: false,
  };
  document.getElementById("combat-overlay").classList.remove("hidden");
  document.getElementById("cb-log").innerHTML = "";
  cbLog(`A wild ${m.name} (Lvl ${m.lvl}) appears!`, "info");
  renderCombat();
}

function cbLog(text, kind = "info") {
  const el = document.getElementById("cb-log");
  if (!el) return;
  const div = document.createElement("div");
  div.className = "entry log-" + kind;
  div.innerHTML = text;
  el.appendChild(div);
  el.scrollTop = el.scrollHeight;
}

function renderCombat() {
  const eff = effectiveStats();
  document.getElementById("cb-hero-name").textContent = `${S.name} (Lvl ${S.level})`;
  document.getElementById("cb-foe-name").textContent  = `${CB.foe.name} (Lvl ${CB.foe.lvl})`;
  setBar("cb-hero-bar", "cb-hero-hp", S.hp, eff.maxHp);
  setBar("cb-foe-bar",  "cb-foe-hp",  CB.foe.hp, CB.foe.maxHp);
  document.getElementById("cb-foe-bar").style.background = "linear-gradient(180deg, #c46a6a, #8a2c2c)";

  const c = CLASSES[S.klass];
  document.getElementById("cb-skill").textContent = `${c.skill.name} (${c.skill.cost} MP)`;
  document.getElementById("cb-skill").disabled = S.mp < c.skill.cost || CB.over;
  document.getElementById("cb-attack").disabled = CB.over;
  document.getElementById("cb-flee").disabled   = CB.over;
}

function heroAttack(skill = false) {
  if (CB.over) return;
  const eff = effectiveStats();
  const c = CLASSES[S.klass];
  const weapon = S.equip.weapon ? ITEM_BY_ID[S.equip.weapon] : null;
  const baseWeaponDmg = weapon ? weapon.atk : 1;
  let mult = 1;
  let critChance = eff.critChance;
  let name = "strike";

  if (skill) {
    if (S.mp < c.skill.cost) { cbLog("Not enough mana.", "bad"); return; }
    S.mp -= c.skill.cost;
    mult = c.skill.mult;
    critChance += c.skill.critBonus || 0;
    name = c.skill.name;
  }

  // Dodge check
  const foeDodge = Math.min(0.25, CB.foe.lvl * 0.01);
  if (Math.random() < foeDodge) {
    cbLog(`Your ${name} misses!`, "bad");
    return foeTurn();
  }

  let dmg = Math.max(1, Math.floor((baseWeaponDmg + eff.bonusDmg) * mult) - Math.floor(CB.foe.def * 0.5));
  let crit = false;
  if (Math.random() < critChance) {
    dmg = Math.floor(dmg * 1.8);
    crit = true;
  }
  CB.foe.hp -= dmg;
  cbLog(`Your ${name} hits ${CB.foe.name} for <b>${dmg}</b>${crit ? " (CRIT!)" : ""}.`, crit ? "gold" : "good");

  if (CB.foe.hp <= 0) return winCombat();
  foeTurn();
}

function foeTurn() {
  const eff = effectiveStats();
  if (Math.random() < eff.dodgeChance) {
    cbLog(`You deftly dodge the ${CB.foe.name}'s attack.`, "good");
    renderCombat();
    return;
  }
  let dmg = Math.max(1, CB.foe.atk - Math.floor(eff.def * 0.6) - Math.floor(eff.con * 0.2));
  // small variance
  dmg = Math.max(1, Math.floor(dmg * (0.85 + Math.random() * 0.3)));
  S.hp -= dmg;
  cbLog(`${CB.foe.name} hits you for <b>${dmg}</b>.`, "bad");
  if (S.hp <= 0) return loseCombat();
  renderCombat();
}

function winCombat() {
  CB.over = true;
  const m = CB.foe;
  const goldGain = randInt(m.gold[0], m.gold[1]);
  S.gold += goldGain;
  S.xp += m.xp;
  S.kills[m.id] = (S.kills[m.id] || 0) + 1;
  cbLog(`<b>Victory!</b> +${m.xp} XP · +${goldGain} gold.`, "gold");
  // Loot drop
  if (m.loot && m.loot.length && Math.random() < 0.5) {
    const id = m.loot[randInt(0, m.loot.length - 1)];
    addItem(id);
    cbLog(`Loot found: <b>${ITEM_BY_ID[id].name}</b>.`, "good");
  }
  checkLevelUp();
  checkQuests();
  renderCombat();
  // close after a moment
  setTimeout(() => {
    document.getElementById("combat-overlay").classList.add("hidden");
    const cb = CB.onWin;
    CB = null;
    if (cb) cb();
    save();
    render();
  }, 1100);
}

function loseCombat() {
  CB.over = true;
  S.hp = 1;
  const loss = Math.min(S.gold, Math.floor(S.gold * 0.1));
  S.gold -= loss;
  cbLog(`You collapse from your wounds. You stagger back to town and lose <b>${loss}</b> gold.`, "bad");
  S.location = "town";
  S.adventure = null;
  renderCombat();
  setTimeout(() => {
    document.getElementById("combat-overlay").classList.add("hidden");
    CB = null;
    save();
    render();
  }, 1500);
}

function fleeCombat() {
  if (CB.over) return;
  // 60% chance to flee
  if (Math.random() < 0.6) {
    cbLog("You break off and flee.", "info");
    CB.over = true;
    setTimeout(() => {
      document.getElementById("combat-overlay").classList.add("hidden");
      CB = null;
      render();
    }, 700);
  } else {
    cbLog("You fail to escape!", "bad");
    foeTurn();
  }
}

function checkLevelUp() {
  while (S.xp >= xpToNext(S.level)) {
    S.xp -= xpToNext(S.level);
    S.level++;
    S.statPoints += 3;
    const eff = effectiveStats();
    S.hp = eff.maxHp;
    S.mp = eff.maxMp;
    log(`<b>Level up!</b> You are now level ${S.level}. (+3 stat points)`, "gold");
  }
}

function checkQuests() {
  for (let i = S.quests.length - 1; i >= 0; i--) {
    const q = QUESTS.find(x => x.id === S.quests[i]);
    if (!q) continue;
    const kills = S.kills[q.target.kill] || 0;
    if (kills >= q.target.count) {
      S.gold += q.reward.gold;
      S.xp += q.reward.xp;
      log(`Quest complete: <b>${q.name}</b>. +${q.reward.xp} XP · +${q.reward.gold} gold.`, "gold");
      S.quests.splice(i, 1);
      checkLevelUp();
    }
  }
}

/* ============================================================
 *   Utility
 * ============================================================ */
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec));
  if (sec < 60) return sec + "s";
  const m = Math.floor(sec / 60), s = sec % 60;
  if (m < 60) return `${m}m ${s.toString().padStart(2,"0")}s`;
  const h = Math.floor(m / 60), mm = m % 60;
  return `${h}h ${mm.toString().padStart(2,"0")}m`;
}
function setBar(barId, textId, cur, max) {
  cur = Math.max(0, cur);
  const pct = Math.max(0, Math.min(100, (cur / Math.max(1, max)) * 100));
  document.getElementById(barId).style.width = pct + "%";
  document.getElementById(textId).textContent = `${Math.floor(cur)}/${Math.floor(max)}`;
}
function rarityClass(r) { return "rarity-" + (r || "common"); }

/* ============================================================
 *   Render: top bar
 * ============================================================ */
function renderTopbar() {
  if (!S) return;
  const eff = recompute();
  document.getElementById("ui-name").textContent = S.name;
  document.getElementById("ui-class").textContent = CLASSES[S.klass].name;
  document.getElementById("ui-level").textContent = S.level;
  setBar("bar-hp", "ui-hp", S.hp, eff.maxHp);
  setBar("bar-mp", "ui-mp", S.mp, eff.maxMp);
  const xpNeed = xpToNext(S.level);
  setBar("bar-xp", "ui-xp", S.xp, xpNeed);
  document.getElementById("ui-xp").textContent = `${S.xp}/${xpNeed} XP`;
  document.getElementById("ui-gold").textContent = S.gold;

  document.querySelectorAll(".loc").forEach(b => {
    b.classList.toggle("active", b.dataset.loc === S.location);
  });
}

/* ============================================================
 *   Render: locations
 * ============================================================ */
function render() {
  if (!S) return;
  renderTopbar();
  renderLog();
  const c = document.getElementById("content");
  c.innerHTML = "";
  switch (S.location) {
    case "town":       renderTown(c); break;
    case "tavern":     renderTavern(c); break;
    case "adventures": renderAdventures(c); break;
    case "arena":      renderArena(c); break;
    case "blacksmith": renderBlacksmith(c); break;
    case "healer":     renderHealer(c); break;
    case "training":   renderTraining(c); break;
    case "character":  renderCharacter(c); break;
  }
}

function renderTown(c) {
  c.innerHTML = `
    <div class="card">
      <h2>Town Square of Ravenford</h2>
      <p class="flavor">Cobblestones and lantern light. Adventurers, merchants and beggars cross paths here.</p>
      <p>Welcome, ${S.name} the ${CLASSES[S.klass].name}. The town is restless — there is coin and glory to be earned.</p>
      <ul>
        <li>Visit the <b>Tavern</b> for rumors, rest, and quests.</li>
        <li>Set out on <b>Adventures</b> to earn experience and gold over time.</li>
        <li>Test your steel in the <b>Arena</b>.</li>
        <li>Equip yourself at the <b>Blacksmith</b>.</li>
        <li>Heal your wounds at the <b>Healer</b>.</li>
        <li>Spend stat points at the <b>Training Hall</b>.</li>
      </ul>
    </div>`;
}

function renderTavern(c) {
  // Pick 3 available quests for the hero
  const available = QUESTS.filter(q => !S.quests.includes(q.id));
  c.innerHTML = `
    <div class="card">
      <h2>The Drunken Boar Tavern</h2>
      <p class="flavor">A fire crackles. Patrons whisper of bounties on monstrous heads.</p>
      <button id="t-rest">Rest a while (5 gold, full heal)</button>
    </div>
    <div class="card">
      <h3>Active Quests</h3>
      ${
        S.quests.length === 0
          ? `<p class="empty-msg">No quests accepted.</p>`
          : S.quests.map(qid => {
              const q = QUESTS.find(x => x.id === qid);
              const k = S.kills[q.target.kill] || 0;
              return `<div class="quest">
                <h4>${q.name}</h4>
                <div>${q.desc}</div>
                <div>Progress: ${Math.min(k, q.target.count)} / ${q.target.count}</div>
                <div class="reward">Reward: ${q.reward.xp} XP · ${q.reward.gold} gold</div>
              </div>`;
            }).join("")
      }
    </div>
    <div class="card">
      <h3>Available Bounties</h3>
      ${
        available.length === 0
          ? `<p class="empty-msg">No new bounties posted.</p>`
          : available.map(q => `
            <div class="quest">
              <h4>${q.name}</h4>
              <div>${q.desc}</div>
              <div class="reward">Reward: ${q.reward.xp} XP · ${q.reward.gold} gold</div>
              <button data-accept="${q.id}">Accept</button>
            </div>`).join("")
      }
    </div>`;
  document.getElementById("t-rest").onclick = () => {
    if (S.gold < 5) { log("You can't afford to rest.", "bad"); return; }
    S.gold -= 5;
    const eff = effectiveStats();
    S.hp = eff.maxHp; S.mp = eff.maxMp;
    log("You rest by the fire and feel restored.", "good");
    save(); render();
  };
  c.querySelectorAll("[data-accept]").forEach(b => {
    b.onclick = () => {
      S.quests.push(b.dataset.accept);
      log(`Quest accepted: <b>${QUESTS.find(q => q.id === b.dataset.accept).name}</b>.`, "info");
      save(); render();
    };
  });
}

function renderAdventures(c) {
  if (S.adventure) {
    const a = ADVENTURES.find(x => x.id === S.adventure.id);
    const remaining = Math.max(0, S.adventure.endsAt - Date.now()) / 1000;
    c.innerHTML = `
      <div class="card">
        <h2>On Adventure: ${a.name}</h2>
        <p class="flavor">You are abroad. The Chronicle will record your fate.</p>
        <div class="adventure-timer" id="adv-timer">${fmtTime(remaining)}</div>
        <div class="item-actions">
          <button id="adv-cancel" class="ghost">Cancel (no reward)</button>
        </div>
      </div>`;
    document.getElementById("adv-cancel").onclick = () => {
      S.adventure = null;
      log("You abandon the adventure and return to town.", "info");
      save(); render();
    };
    return;
  }
  c.innerHTML = `
    <div class="card">
      <h2>Adventure Board</h2>
      <p class="flavor">Set out to explore. You may not return unscathed.</p>
    </div>
    <div class="grid">
      ${ADVENTURES.map(a => {
        const can = S.level >= a.minLvl;
        return `<div class="item ${rarityClass("common")}">
          <h4>${a.name} <span class="price">Lvl ${a.minLvl}+</span></h4>
          <div class="desc">Duration: ${fmtTime(a.duration)}</div>
          <div class="stats">Reward: ${a.reward.xp} XP · ${a.reward.gold[0]}–${a.reward.gold[1]} gold${a.foe ? ` · may encounter ${MONSTERS.find(m=>m.id===a.foe).name}` : ""}</div>
          <div class="item-actions">
            <button ${can ? "" : "disabled"} data-adv="${a.id}">Embark</button>
          </div>
        </div>`;
      }).join("")}
    </div>`;
  c.querySelectorAll("[data-adv]").forEach(b => {
    b.onclick = () => {
      const a = ADVENTURES.find(x => x.id === b.dataset.adv);
      S.adventure = { id: a.id, endsAt: Date.now() + a.duration * 1000 };
      log(`You set out: <b>${a.name}</b>.`, "info");
      save(); render();
    };
  });
}

function adventureTick() {
  if (!S || !S.adventure) return;
  const remaining = (S.adventure.endsAt - Date.now()) / 1000;
  const el = document.getElementById("adv-timer");
  if (el) el.textContent = fmtTime(remaining);
  if (remaining <= 0) finishAdventure();
}

function finishAdventure() {
  const a = ADVENTURES.find(x => x.id === S.adventure.id);
  S.adventure = null;
  // Possible encounter
  if (a.foe && Math.random() < 0.7) {
    log(`On <b>${a.name}</b> you are attacked!`, "info");
    startCombat(a.foe, () => {
      const goldGain = randInt(a.reward.gold[0], a.reward.gold[1]);
      S.gold += goldGain;
      S.xp += a.reward.xp;
      log(`Adventure complete: <b>${a.name}</b>. +${a.reward.xp} XP · +${goldGain} gold.`, "gold");
      checkLevelUp();
    });
  } else {
    const goldGain = randInt(a.reward.gold[0], a.reward.gold[1]);
    S.gold += goldGain;
    S.xp += a.reward.xp;
    log(`Adventure complete: <b>${a.name}</b>. +${a.reward.xp} XP · +${goldGain} gold.`, "gold");
    checkLevelUp();
    save(); render();
  }
}

function renderArena(c) {
  c.innerHTML = `
    <div class="card">
      <h2>The Arena</h2>
      <p class="flavor">Sand, blood, and the cheers of the crowd. Choose your foe.</p>
    </div>
    <div class="grid">
      ${MONSTERS.map(m => {
        const can = m.lvl <= S.level + 2;
        return `<div class="item ${rarityClass(m.lvl >= 16 ? "epic" : m.lvl >= 10 ? "rare" : m.lvl >= 5 ? "uncommon" : "common")}">
          <h4>${m.name} <span class="price">Lvl ${m.lvl}</span></h4>
          <div class="stats">HP ${m.hp} · ATK ${m.atk} · DEF ${m.def}</div>
          <div class="desc">XP ${m.xp} · ${m.gold[0]}–${m.gold[1]}g · drops possible</div>
          <div class="item-actions">
            <button ${can ? "" : "disabled"} data-fight="${m.id}">Fight</button>
          </div>
        </div>`;
      }).join("")}
    </div>`;
  c.querySelectorAll("[data-fight]").forEach(b => {
    b.onclick = () => startCombat(b.dataset.fight, () => { save(); render(); });
  });
}

function renderBlacksmith(c) {
  const c2 = CLASSES[S.klass];
  // Show items grouped
  const buyList = ITEMS.filter(i => i.slot !== "potion");
  c.innerHTML = `
    <div class="card">
      <h2>Gareth's Forge</h2>
      <p class="flavor">Hammer and bellows. Steel awaits a worthy hand.</p>
    </div>
    <div class="card">
      <h3>Your Equipment</h3>
      <div class="equip-slots">
        ${["weapon","armor","helm","boots","ring"].map(slot => {
          const id = S.equip[slot];
          const it = id ? ITEM_BY_ID[id] : null;
          return `<div class="slot ${it ? "" : "empty"}">
            <div class="slot-label">${slot}</div>
            <div class="equipped">${it ? it.name : "— empty —"}</div>
            ${it ? `<button class="small" data-unequip="${slot}">Unequip</button>` : ""}
          </div>`;
        }).join("")}
      </div>
    </div>
    <div class="card">
      <h3>Your Inventory</h3>
      ${
        S.inventory.length === 0
          ? `<p class="empty-msg">Your pack is empty.</p>`
          : `<div class="grid">${
            S.inventory.map((entry, idx) => {
              const it = ITEM_BY_ID[entry.id];
              const canEquip = it.slot !== "potion" && (it.slot !== "weapon" || it.type === c2.weaponType);
              return `<div class="item ${rarityClass(it.rarity)}">
                <h4>${it.name}${entry.qty ? ` <span class="price">×${entry.qty}</span>` : ""}</h4>
                <div class="stats">${itemStatLine(it)}</div>
                <div class="item-actions">
                  ${canEquip ? `<button data-equip="${idx}">Equip</button>` : ""}
                  <button class="ghost" data-sell="${idx}">Sell (${Math.floor((it.price||5)/2)}g)</button>
                </div>
              </div>`;
            }).join("")
          }</div>`
      }
    </div>
    <div class="card">
      <h3>Wares for Sale</h3>
      <div class="grid">${
        buyList.map(it => {
          const canUse = it.slot !== "weapon" || it.type === c2.weaponType;
          return `<div class="item ${rarityClass(it.rarity)}">
            <h4>${it.name} <span class="price">${it.price}g</span></h4>
            <div class="stats">${itemStatLine(it)}</div>
            <div class="desc">${canUse ? "" : "<i>Wrong weapon type for your class.</i>"}</div>
            <div class="item-actions">
              <button ${S.gold >= it.price ? "" : "disabled"} data-buy="${it.id}">Buy</button>
            </div>
          </div>`;
        }).join("")
      }</div>
    </div>`;

  c.querySelectorAll("[data-unequip]").forEach(b => {
    b.onclick = () => {
      const slot = b.dataset.unequip;
      const id = S.equip[slot];
      S.equip[slot] = null;
      addItem(id);
      log(`Unequipped ${ITEM_BY_ID[id].name}.`, "info");
      save(); render();
    };
  });
  c.querySelectorAll("[data-equip]").forEach(b => {
    b.onclick = () => {
      const idx = +b.dataset.equip;
      const entry = S.inventory[idx];
      const it = ITEM_BY_ID[entry.id];
      if (S.equip[it.slot]) {
        addItem(S.equip[it.slot]);
      }
      S.equip[it.slot] = it.id;
      removeItem(idx);
      log(`Equipped ${it.name}.`, "good");
      save(); render();
    };
  });
  c.querySelectorAll("[data-sell]").forEach(b => {
    b.onclick = () => {
      const idx = +b.dataset.sell;
      const it = ITEM_BY_ID[S.inventory[idx].id];
      const price = Math.floor((it.price || 5) / 2);
      S.gold += price;
      // sell one of stack
      if (S.inventory[idx].qty && S.inventory[idx].qty > 1) S.inventory[idx].qty--;
      else removeItem(idx);
      log(`Sold ${it.name} for ${price}g.`, "gold");
      save(); render();
    };
  });
  c.querySelectorAll("[data-buy]").forEach(b => {
    b.onclick = () => {
      const it = ITEM_BY_ID[b.dataset.buy];
      if (S.gold < it.price) return;
      S.gold -= it.price;
      addItem(it.id);
      log(`Purchased ${it.name}.`, "gold");
      save(); render();
    };
  });
}

function itemStatLine(it) {
  const parts = [];
  if (it.atk) parts.push(`ATK +${it.atk}`);
  if (it.def) parts.push(`DEF +${it.def}`);
  if (it.str) parts.push(`STR +${it.str}`);
  if (it.dex) parts.push(`DEX +${it.dex}`);
  if (it.con) parts.push(`CON +${it.con}`);
  if (it.int) parts.push(`INT +${it.int}`);
  if (it.heal) parts.push(`Heals ${it.heal} HP`);
  if (it.mana) parts.push(`Restores ${it.mana} MP`);
  return parts.join(" · ") || "&nbsp;";
}

function renderHealer(c) {
  const eff = effectiveStats();
  const missingHp = eff.maxHp - S.hp;
  const missingMp = eff.maxMp - S.mp;
  const costHp = Math.ceil(missingHp * 0.5);
  const costMp = Math.ceil(missingMp * 0.6);

  c.innerHTML = `
    <div class="card">
      <h2>Sister Maela's Sanctuary</h2>
      <p class="flavor">Incense and prayer. The hurt are mended, for a tithe.</p>
      <p>HP: ${Math.floor(S.hp)} / ${eff.maxHp} · MP: ${Math.floor(S.mp)} / ${eff.maxMp}</p>
      <div class="item-actions">
        <button id="heal-hp" ${missingHp > 0 && S.gold >= costHp ? "" : "disabled"}>Heal HP (${costHp}g)</button>
        <button id="heal-mp" ${missingMp > 0 && S.gold >= costMp ? "" : "disabled"}>Restore MP (${costMp}g)</button>
        <button id="heal-full" ${(missingHp+missingMp>0) && S.gold >= (costHp+costMp) ? "" : "disabled"}>Full (${costHp+costMp}g)</button>
      </div>
    </div>
    <div class="card">
      <h3>Potions in your pack</h3>
      ${
        S.inventory.filter(e => ITEM_BY_ID[e.id].slot === "potion").length === 0
          ? `<p class="empty-msg">You carry no potions.</p>`
          : `<div class="grid">${
              S.inventory.map((e, idx) => {
                const it = ITEM_BY_ID[e.id];
                if (it.slot !== "potion") return "";
                return `<div class="item ${rarityClass(it.rarity)}">
                  <h4>${it.name} <span class="price">×${e.qty || 1}</span></h4>
                  <div class="stats">${itemStatLine(it)}</div>
                  <div class="item-actions">
                    <button data-use="${idx}">Use</button>
                  </div>
                </div>`;
              }).join("")
            }</div>`
      }
    </div>`;
  document.getElementById("heal-hp").onclick = () => { S.gold -= costHp; S.hp = eff.maxHp; log("You are healed.", "good"); save(); render(); };
  document.getElementById("heal-mp").onclick = () => { S.gold -= costMp; S.mp = eff.maxMp; log("Your mana is restored.", "good"); save(); render(); };
  document.getElementById("heal-full").onclick = () => { S.gold -= (costHp+costMp); S.hp = eff.maxHp; S.mp = eff.maxMp; log("You are fully restored.", "good"); save(); render(); };
  c.querySelectorAll("[data-use]").forEach(b => {
    b.onclick = () => {
      const idx = +b.dataset.use;
      const entry = S.inventory[idx];
      const it = ITEM_BY_ID[entry.id];
      const eff2 = effectiveStats();
      if (it.heal) S.hp = Math.min(eff2.maxHp, S.hp + it.heal);
      if (it.mana) S.mp = Math.min(eff2.maxMp, S.mp + it.mana);
      if (entry.qty && entry.qty > 1) entry.qty--; else removeItem(idx);
      log(`You drink a ${it.name}.`, "good");
      save(); render();
    };
  });
}

function renderTraining(c) {
  c.innerHTML = `
    <div class="card">
      <h2>Training Hall</h2>
      <p class="flavor">Sweat, discipline, mastery. Hone what makes you a hero.</p>
      <p>Unspent stat points: <b>${S.statPoints}</b></p>
      <div class="stat-block">
        ${["str","dex","con","int"].map(k => `
          <div class="stat">
            <div class="name">${({str:"Strength",dex:"Dexterity",con:"Constitution",int:"Intellect"})[k]}</div>
            <div class="value">${S[k]}</div>
            <button class="plus" data-stat="${k}" ${S.statPoints > 0 ? "" : "disabled"}>+1</button>
          </div>`).join("")}
      </div>
      <p class="flavor">STR boosts melee damage. DEX boosts ranged damage, crit and dodge. CON gives more HP. INT boosts magic damage and mana.</p>
    </div>`;
  c.querySelectorAll("[data-stat]").forEach(b => {
    b.onclick = () => {
      if (S.statPoints <= 0) return;
      S[b.dataset.stat]++;
      S.statPoints--;
      log(`You train ${b.dataset.stat.toUpperCase()} to ${S[b.dataset.stat]}.`, "good");
      save(); render();
    };
  });
}

function renderCharacter(c) {
  const eff = effectiveStats();
  const cls = CLASSES[S.klass];
  c.innerHTML = `
    <div class="card">
      <h2>${S.name}</h2>
      <p class="flavor">${cls.name} of Level ${S.level}</p>
      <div class="stat-block">
        <div class="stat"><div class="name">Strength</div><div class="value">${S.str}</div></div>
        <div class="stat"><div class="name">Dexterity</div><div class="value">${S.dex}</div></div>
        <div class="stat"><div class="name">Constitution</div><div class="value">${S.con}</div></div>
        <div class="stat"><div class="name">Intellect</div><div class="value">${S.int}</div></div>
      </div>
      <div class="stat-block">
        <div class="stat"><div class="name">Max HP</div><div class="value">${eff.maxHp}</div></div>
        <div class="stat"><div class="name">Max MP</div><div class="value">${eff.maxMp}</div></div>
        <div class="stat"><div class="name">Weapon ATK</div><div class="value">${(S.equip.weapon ? ITEM_BY_ID[S.equip.weapon].atk : 1) + eff.bonusDmg}</div></div>
        <div class="stat"><div class="name">Armor DEF</div><div class="value">${eff.def}</div></div>
        <div class="stat"><div class="name">Crit Chance</div><div class="value">${(eff.critChance*100).toFixed(1)}%</div></div>
        <div class="stat"><div class="name">Dodge Chance</div><div class="value">${(eff.dodgeChance*100).toFixed(1)}%</div></div>
      </div>
    </div>
    <div class="card">
      <h3>Class Ability</h3>
      <p><b>${cls.skill.name}</b> — ${cls.skill.desc} <span class="price">${cls.skill.cost} MP</span></p>
    </div>
    <div class="card">
      <h3>Foes Slain</h3>
      ${
        Object.keys(S.kills).length === 0
          ? `<p class="empty-msg">No notable kills yet.</p>`
          : Object.entries(S.kills).map(([id, n]) => {
              const m = MONSTERS.find(mm => mm.id === id);
              return m ? `<div>${m.name}: <b>${n}</b></div>` : "";
            }).join("")
      }
    </div>`;
}

/* ============================================================
 *   Startup & Wiring
 * ============================================================ */
function startGame() {
  document.getElementById("screen-create").classList.add("hidden");
  document.getElementById("screen-game").classList.remove("hidden");
  recompute();
  render();
}

function wireCreateScreen() {
  let selected = null;
  document.querySelectorAll(".class-card").forEach(card => {
    card.onclick = () => {
      document.querySelectorAll(".class-card").forEach(c => c.classList.remove("selected"));
      card.classList.add("selected");
      selected = card.dataset.class;
    };
  });
  document.getElementById("btn-create").onclick = () => {
    const name = (document.getElementById("hero-name").value || "").trim();
    if (!name) { alert("Name your hero."); return; }
    if (!selected) { alert("Choose a class."); return; }
    S = newHero(name, selected);
    const eff = effectiveStats();
    S.hp = eff.maxHp; S.mp = eff.maxMp;
    log(`A new hero rises: <b>${S.name}</b>, the ${CLASSES[S.klass].name}.`, "gold");
    save();
    startGame();
  };
  document.getElementById("btn-load").onclick = () => {
    const saved = loadFromStorage();
    if (!saved) { alert("No saved hero found."); return; }
    S = saved;
    startGame();
    log("Welcome back, hero.", "info");
  };
  document.getElementById("btn-load").disabled = !hasSave();
}

function wireGameScreen() {
  document.querySelectorAll(".loc").forEach(b => {
    b.onclick = () => {
      if (S.adventure && b.dataset.loc !== "adventures") {
        // Allow free movement; the adventure continues running in background
      }
      S.location = b.dataset.loc;
      render();
    };
  });
  document.getElementById("btn-save").onclick = save;
  document.getElementById("btn-reset").onclick = () => {
    if (!confirm("Abandon this hero and start fresh? Your save will be wiped.")) return;
    localStorage.removeItem(SAVE_KEY);
    location.reload();
  };

  document.getElementById("cb-attack").onclick = () => heroAttack(false);
  document.getElementById("cb-skill").onclick  = () => heroAttack(true);
  document.getElementById("cb-flee").onclick   = fleeCombat;
}

function tick() {
  if (!S) return;
  if (S.adventure) adventureTick();
}

/* ---------- Boot ---------- */
window.addEventListener("DOMContentLoaded", () => {
  wireCreateScreen();
  wireGameScreen();

  const saved = loadFromStorage();
  if (saved) {
    // Auto-resume on reload to feel more like a persistent world
    S = saved;
    startGame();
  }

  setInterval(tick, 500);
  // Auto-save every 30s
  setInterval(() => { if (S) save(); }, 30000);
});
