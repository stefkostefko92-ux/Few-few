// Carbon Stealth POS — Electron main процес.
// Пуска самостоятелния Next сървър (standalone build) на локален порт и го
// зарежда в цял екран / kiosk прозорец, подходящ за тъч монитор на каса.
//
// Данни (SQLite база, SESSION_SECRET) живеят в потребителската папка
// (app.getPath('userData')) — НЕ в инсталационната, за да не се трият при ъпдейт
// и да не искат админ права за писане.

const { app, BrowserWindow, Menu, dialog, globalShortcut } = require("electron");
const { fork } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");
const net = require("node:net");
const http = require("node:http");

const isDev = !app.isPackaged;

// Опакованият standalone сървър е в resources/server (extraResources, разпакетиран).
const serverRoot = isDev
  ? path.join(__dirname, "server")
  : path.join(process.resourcesPath, "server");

const userDataDir = app.getPath("userData");
const dbPath = path.join(userDataDir, "carbon-stealth-pos.db");
const configPath = path.join(userDataDir, "config.json");

let serverProc = null;
let win = null;

/** Свободен TCP порт на loopback. */
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

/** Постоянна конфигурация (SESSION_SECRET) в userData. */
function loadOrCreateConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch {
    const cfg = { sessionSecret: crypto.randomBytes(32).toString("hex") };
    fs.mkdirSync(userDataDir, { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2), { mode: 0o600 });
    return cfg;
  }
}

/** При първо пускане копира заредения шаблон на базата в userData. */
function ensureDatabase() {
  if (fs.existsSync(dbPath)) return;
  const template = path.join(serverRoot, "prisma", "template.db");
  fs.mkdirSync(userDataDir, { recursive: true });
  if (fs.existsSync(template)) {
    fs.copyFileSync(template, dbPath);
  }
  // Ако няма шаблон, Prisma ще създаде празна база при първата заявка (db push
  // се извършва при билда → template.db винаги съществува в реален релийз).
}

/** Изчаква сървърът да отговори (макс. ~30 с). */
function waitForServer(port) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 30_000;
    const tick = () => {
      const req = http.get({ host: "127.0.0.1", port, path: "/login" }, (res) => {
        res.destroy();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() > deadline) reject(new Error("Сървърът не стартира навреме."));
        else setTimeout(tick, 400);
      });
    };
    tick();
  });
}

async function startServer() {
  const cfg = loadOrCreateConfig();
  ensureDatabase();
  const port = await freePort();

  const engine = path.join(
    serverRoot,
    "node_modules",
    ".prisma",
    "client",
    "query_engine-windows.dll.node"
  );

  serverProc = fork(path.join(serverRoot, "server.js"), [], {
    cwd: serverRoot,
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      DATABASE_URL: `file:${dbPath}`,
      SESSION_SECRET: cfg.sessionSecret,
      ...(fs.existsSync(engine) ? { PRISMA_QUERY_ENGINE_LIBRARY: engine } : {}),
    },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  serverProc.stdout?.on("data", (d) => process.stdout.write(`[server] ${d}`));
  serverProc.stderr?.on("data", (d) => process.stderr.write(`[server] ${d}`));

  await waitForServer(port);
  return port;
}

function createWindow(port) {
  win = new BrowserWindow({
    show: false,
    fullscreen: true, // цял екран за тъч монитор
    backgroundColor: "#eef1f6",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  Menu.setApplicationMenu(null);
  win.loadURL(`http://127.0.0.1:${port}/`);
  win.once("ready-to-show", () => win.show());
}

app.whenReady().then(async () => {
  try {
    const port = await startServer();
    createWindow(port);
    // F11 — превключване на цял екран; Ctrl+Shift+I само в dev.
    globalShortcut.register("F11", () => win && win.setFullScreen(!win.isFullScreen()));
  } catch (err) {
    dialog.showErrorBox("Carbon Stealth POS", `Грешка при стартиране:\n${err.message}`);
    app.quit();
  }
});

app.on("window-all-closed", () => app.quit());
app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  if (serverProc) serverProc.kill();
});
