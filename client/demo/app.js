import { KaguraClient, generateDeviceId } from "../dist/index.js";

// ---- Config -------------------------------------------------------------
const params = new URLSearchParams(location.search);
const API = params.get("api") || localStorage.getItem("kagura.api") || "http://localhost:3000";
localStorage.setItem("kagura.api", API);
document.getElementById("apiNote").textContent = `API: ${API}`;

const SYMBOL = { coin: "🪙", ward: "🛡️", strike: "⚔️", raid: "🦊", spirit: "✨" };
const ISLAND_NAMES = ["Родово светилище", "Пазарът на фенери", "Гора на ехото", "Лотосово езеро", "Драконов хребет"];

const client = new KaguraClient({ baseUrl: API });
let chatConn = null;

// ---- Helpers ------------------------------------------------------------
const $ = (id) => document.getElementById(id);
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2600);
}
async function guard(fn) {
  try {
    return await fn();
  } catch (e) {
    toast(e?.message ?? "error");
    throw e;
  }
}

// ---- Auth ---------------------------------------------------------------
$("playBtn").onclick = () => guard(async () => {
  const name = $("nameInput").value.trim() || "Kannushi";
  let deviceId = localStorage.getItem("kagura.deviceId");
  const secret = localStorage.getItem("kagura.deviceSecret");
  if (deviceId && secret) {
    await client.login(deviceId, secret);
  } else {
    deviceId = generateDeviceId();
    const { deviceSecret } = await client.register(name, deviceId);
    localStorage.setItem("kagura.deviceId", deviceId);
    localStorage.setItem("kagura.deviceSecret", deviceSecret);
  }
  enterGame();
});

$("logoutBtn").onclick = async () => {
  try { await client.logout(); } catch { /* ignore */ }
  if (chatConn) chatConn.close();
  location.reload();
};

async function enterGame() {
  $("login").style.display = "none";
  $("app").style.display = "block";
  await refreshAll();
  loadShop();
}

// Auto-login if we already have a device secret.
if (localStorage.getItem("kagura.deviceSecret")) {
  $("playBtn").textContent = "Continue ▶";
}

// ---- Rendering ----------------------------------------------------------
function renderResources(p) {
  $("rSpins").textContent = p.spins;
  $("rCoins").textContent = p.coins;
  $("rSpirit").textContent = p.spiritTokens;
  $("rGems").textContent = p.gems;
  $("rShields").textContent = p.shields;
  $("rIsland").textContent = p.currentIsland + 1;
  $("islandName").textContent = ISLAND_NAMES[p.currentIsland] ?? `Island ${p.currentIsland + 1}`;
}

function renderBuildings(p) {
  const island = p.islands[p.currentIsland];
  $("buildings").innerHTML = island.buildings
    .map((b, i) => `
      <div class="bld">
        <div>#${i + 1}</div>
        <div class="lvl">${b.level}/5</div>
        <button data-build="${i}" ${b.level >= 5 ? "disabled" : ""}>Build</button>
      </div>`)
    .join("");
  for (const btn of document.querySelectorAll("[data-build]")) {
    btn.onclick = () => guard(async () => {
      const r = await client.build(Number(btn.dataset.build));
      if (r.unlockedIsland !== null) toast(`🎉 Unlocked island ${r.unlockedIsland + 1}!`);
      await refreshAll();
    });
  }
}

async function refreshAll() {
  const { player } = await client.me();
  renderResources(player);
  renderBuildings(player);
  renderClan(player);
  loadLeaderboard();
  return player;
}

// ---- Spin ---------------------------------------------------------------
$("spinBtn").onclick = () => guard(async () => {
  const btn = $("spinBtn");
  btn.disabled = true;
  $("outcome").textContent = "";
  const anim = setInterval(() => {
    for (let i = 0; i < 3; i++) $(`reel${i}`).textContent = pickRandomSymbol();
  }, 70);

  try {
    const bet = Math.max(1, Number($("bet").value) || 1);
    const { outcome } = await client.spin(bet);
    setTimeout(async () => {
      clearInterval(anim);
      outcome.reels.forEach((s, i) => ($(`reel${i}`).textContent = SYMBOL[s]));
      $("outcome").textContent = describeOutcome(outcome);
      await resolveAction(outcome);
      await refreshAll();
      btn.disabled = false;
    }, 600);
  } catch (e) {
    clearInterval(anim);
    btn.disabled = false;
    toast(e?.message ?? "spin failed");
  }
});

function pickRandomSymbol() {
  const k = Object.values(SYMBOL);
  return k[Math.floor(Math.random() * k.length)];
}
function describeOutcome(o) {
  switch (o.type) {
    case "JACKPOT": return `🪙 Jackpot! +${o.coins} coins`;
    case "SHIELDS": return `🛡️ +${o.shields} shields`;
    case "SPIRIT": return `✨ +${o.spiritTokens} spirit tokens`;
    case "ATTACK": return `⚔️ Strike! +${o.coins} coins, attacking…`;
    case "RAID": return `🦊 Raid!`;
    default: return o.coins > 0 ? `+${o.coins} coins` : "no luck — spin again";
  }
}
async function resolveAction(outcome) {
  if (outcome.action === "ATTACK") {
    const { candidates } = await client.attackCandidates();
    if (candidates[0]) {
      const r = await client.attack(candidates[0].id, 0);
      $("outcome").textContent = r.blocked ? "⚔️ Blocked by a shield!" : `⚔️ Raided ${r.reward} coins from ${candidates[0].name}`;
    }
  } else if (outcome.action === "RAID") {
    const r = await client.raid([0, 1, 2]);
    $("outcome").textContent = `🦊 Dug up ${r.reward} coins!`;
  }
}

// ---- Summon -------------------------------------------------------------
$("summonBtn").onclick = () => guard(async () => {
  const r = await client.summon();
  const stars = { common: "★3", rare: "★4", epic: "★5", mythic: "★6" }[r.rarity];
  $("summonOut").textContent = `${stars} ${r.rarity}${r.viaPity ? " (pity!)" : ""}`;
  await refreshAll();
});

// ---- Shop ---------------------------------------------------------------
async function loadShop() {
  const { products } = await client.shop();
  $("shop").innerHTML = products
    .map((p) => `<li><span>${p.productId} <span class="muted">€${p.priceEUR}</span></span><button data-buy="${p.productId}">Buy</button></li>`)
    .join("");
  for (const btn of document.querySelectorAll("[data-buy]")) {
    btn.onclick = () => guard(async () => {
      const id = btn.dataset.buy;
      const res = await fetch(`${API}/iap/dev-receipt?productId=${encodeURIComponent(id)}`);
      if (!res.ok) return toast("dev receipts disabled (set ENABLE_DEV_RECEIPTS=true)");
      const { receipt } = await res.json();
      await client.redeem("stripe", id, receipt);
      toast(`✓ purchased ${id}`);
      await refreshAll();
    });
  }
}

// ---- Leaderboard --------------------------------------------------------
$("lbRefresh").onclick = () => loadLeaderboard();
async function loadLeaderboard() {
  const { leaderboard } = await client.leaderboard(10);
  $("leaderboard").innerHTML = leaderboard.length
    ? leaderboard.map((e) => `<li><span>#${e.rank} ${e.name}</span><b>🪙 ${e.score}</b></li>`).join("")
    : `<li class="muted">no Redis leaderboard configured</li>`;
}

// ---- Clan + chat --------------------------------------------------------
async function renderClan(p) {
  const body = $("clanBody");
  if (!p.clanId) {
    if (chatConn) { chatConn.close(); chatConn = null; }
    const { clans } = await client.listClans();
    body.innerHTML = `
      <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center">
        <input id="clanName" placeholder="Clan name" />
        <input id="clanTag" placeholder="TAG" style="width:90px" />
        <button id="createClanBtn">Create</button>
      </div>
      <p class="muted" style="margin:10px 0 4px">Join an existing clan:</p>
      <ul>${clans.map((c) => `<li><span>[${c.tag}] ${c.name} <span class="muted">${c.memberIds.length}/50</span></span><button class="alt" data-join="${c.id}">Join</button></li>`).join("") || '<li class="muted">no clans yet</li>'}</ul>`;
    $("createClanBtn").onclick = () => guard(async () => {
      await client.createClan($("clanName").value.trim() || "Sky Foxes", ($("clanTag").value.trim() || "FOX").toUpperCase());
      await refreshAll();
    });
    for (const btn of document.querySelectorAll("[data-join]")) {
      btn.onclick = () => guard(async () => { await client.joinClan(btn.dataset.join); await refreshAll(); });
    }
    return;
  }

  // In a clan: show controls + chat.
  body.innerHTML = `
    <div style="display:flex; gap:8px; align-items:center; margin-bottom:10px">
      <button class="ghost" id="leaveClanBtn">Leave clan</button>
      <button class="alt" id="warBtn">⚔️ Declare war</button>
      <span class="muted" id="warStatus"></span>
    </div>
    <div id="chatLog"></div>
    <div style="display:flex; gap:8px; margin-top:8px">
      <input id="chatInput" placeholder="Message your clan…" style="flex:1" />
      <button id="chatSend">Send</button>
    </div>`;
  $("leaveClanBtn").onclick = () => guard(async () => { await client.leaveClan(); await refreshAll(); });
  $("warBtn").onclick = () => guard(async () => {
    const { war } = await client.declareWar();
    toast(`War declared! vs clan ${war.opponentClanId.slice(0, 6)}`);
    showWar();
  });
  showWar();

  const log = $("chatLog");
  const append = (m) => {
    const div = document.createElement("div");
    div.innerHTML = `<b style="color:var(--sakura)">${m.name}:</b> ${escapeHtml(m.text)}`;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  };
  if (!chatConn) {
    chatConn = client.connectChat((e) => {
      if (e.type === "history") (e.messages ?? []).forEach(append);
      else if (e.type === "chat") append(e);
    });
  }
  $("chatSend").onclick = () => {
    const input = $("chatInput");
    const text = input.value.trim();
    if (text && chatConn) { chatConn.send(text); input.value = ""; }
  };
  $("chatInput").onkeydown = (ev) => { if (ev.key === "Enter") $("chatSend").click(); };
}

async function showWar() {
  try {
    const { war } = await client.warStatus();
    $("warStatus").textContent = war ? `war: ${war.myScore} – ${war.opponentScore}` : "no active war";
  } catch { /* ignore */ }
}

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
