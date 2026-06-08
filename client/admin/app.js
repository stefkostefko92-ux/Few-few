// LiveOps console — a generic numeric editor over GET/PUT /admin/liveops (§6.2).
// Loads the live config, renders an editable form for every numeric leaf, and
// pushes the whole (validated) object back. No build step; pure ESM.

const $ = (id) => document.getElementById(id);
const state = { api: "", key: "", config: null };

// ---- Connect gate -------------------------------------------------------
$("apiInput").value = localStorage.getItem("kagura.admin.api") || "http://localhost:3000";
$("keyInput").value = sessionStorage.getItem("kagura.admin.key") || "";

$("connectBtn").onclick = async () => {
  state.api = $("apiInput").value.trim().replace(/\/$/, "");
  state.key = $("keyInput").value.trim();
  $("gateMsg").textContent = "connecting…";
  try {
    await load();
    localStorage.setItem("kagura.admin.api", state.api);
    sessionStorage.setItem("kagura.admin.key", state.key);
    $("gate").style.display = "none";
    $("app").style.display = "block";
    $("apiLabel").textContent = state.api;
  } catch (e) {
    $("gateMsg").textContent = `✗ ${e.message}`;
  }
};
$("logoutBtn").onclick = () => {
  sessionStorage.removeItem("kagura.admin.key");
  location.reload();
};
$("reloadBtn").onclick = () => load().then(render).catch((e) => setMsg(e.message, false));

// ---- API ----------------------------------------------------------------
async function load() {
  const res = await fetch(`${state.api}/admin/liveops`, { headers: { "x-admin-key": state.key } });
  if (!res.ok) throw new Error(res.status === 403 ? "forbidden (bad admin key?)" : `HTTP ${res.status}`);
  state.config = (await res.json()).config;
  render();
}

async function save() {
  setMsg("pushing…", true);
  const res = await fetch(`${state.api}/admin/liveops`, {
    method: "PUT",
    headers: { "content-type": "application/json", "x-admin-key": state.key },
    body: JSON.stringify(state.config),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const issues = body?.error?.issues?.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(issues || body?.error?.message || `HTTP ${res.status}`);
  }
  state.config = body.config;
  render();
  setMsg("✓ pushed live", true);
}
$("saveBtn").onclick = () => save().catch((e) => setMsg(`✗ ${e.message}`, false));

function setMsg(text, ok) {
  const el = $("msg");
  el.textContent = text;
  el.className = ok ? "ok" : "err";
}

// ---- Render -------------------------------------------------------------
function render() {
  $("raw").textContent = JSON.stringify(state.config, null, 2);
  const root = $("form");
  root.innerHTML = "";
  for (const [key, val] of Object.entries(state.config)) {
    root.appendChild(section(key, val, [key]));
  }
}

function section(title, obj, path) {
  const fs = document.createElement("fieldset");
  const lg = document.createElement("legend");
  lg.textContent = title;
  fs.appendChild(lg);
  for (const [key, val] of Object.entries(obj)) {
    const here = [...path, key];
    if (val !== null && typeof val === "object") {
      fs.appendChild(section(key, val, here));
    } else if (typeof val === "number") {
      fs.appendChild(numberRow(key, val, here));
    }
  }
  // Reel-weight distribution preview.
  if (title === "reelWeights") fs.appendChild(weightBar(obj, path));
  return fs;
}

function numberRow(key, val, path) {
  const row = document.createElement("div");
  row.className = "row";
  const label = document.createElement("label");
  label.innerHTML = `${key} <span class="path">${path.join(".")}</span>`;
  const input = document.createElement("input");
  input.type = "number";
  input.step = Number.isInteger(val) ? "1" : "any";
  input.value = String(val);
  input.oninput = () => {
    const n = input.valueAsNumber;
    if (!Number.isNaN(n)) {
      setAtPath(state.config, path, n);
      $("raw").textContent = JSON.stringify(state.config, null, 2);
      if (path[path.length - 2] === "reelWeights") refreshBars();
    }
  };
  row.append(label, input);
  return row;
}

function weightBar(weights, path) {
  const wrap = document.createElement("div");
  wrap.dataset.weightbar = path.join(".");
  wrap.className = "muted";
  renderBars(wrap, weights);
  return wrap;
}
function renderBars(wrap, weights) {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  wrap.innerHTML =
    `total weight: ${total}` +
    Object.entries(weights)
      .map(([k, w]) => `<div>${k}: ${((w / total) * 100).toFixed(1)}%<div class="bar" style="width:${(w / total) * 100}%"></div></div>`)
      .join("");
}
function refreshBars() {
  for (const wrap of document.querySelectorAll("[data-weightbar]")) {
    renderBars(wrap, getAtPath(state.config, wrap.dataset.weightbar.split(".")));
  }
}

function setAtPath(obj, path, value) {
  let o = obj;
  for (let i = 0; i < path.length - 1; i++) o = o[path[i]];
  o[path[path.length - 1]] = value;
}
function getAtPath(obj, path) {
  return path.reduce((o, k) => o[k], obj);
}
