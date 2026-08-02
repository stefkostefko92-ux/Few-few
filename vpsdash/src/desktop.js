// Незадължителен графичен десктоп (Ubuntu + XFCE в контейнер), показан ВЪТРЕ в
// панела.
//
// Двете решения, които определят целия модул:
//
//  1. **Десктопът не е част от панела.** Клиентът на KasmVNC/noVNC е около мегабайт
//     чужд JavaScript. Вкараме ли го в `public/`, правилото „нула зависимости" —
//     върху което е построен целият продукт — престава да важи. Затова десктопът
//     живее в контейнер, който някой друг поддържа, а панелът само го ПОКАЗВА.
//
//  2. **Единственият път навътре минава през входа на панела.** Контейнерът слуша
//     само на 127.0.0.1, а браузърът стига до него през `/desktop/…` на самия
//     панел. Тоест десктопът наследява сесията, 2FA-та и списъка с разрешени
//     адреси, вместо да бъде втора врата със собствена парола. Ако това се
//     заобиколи (публикуван порт, отделен vhost), целият модел пада.
//
// Проксито е ръчно, защото `node:http` няма готово: обикновените заявки минават
// през `http.request`, а WebSocket-ът — през `upgrade` събитието и суров сокет.
// VNC е WebSocket по цялото си протежение; без втората част рамката се зарежда и
// остава черна.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from './exec.js';

export const CONTAINER = 'csd-desktop';
export const PREFIX = '/desktop';
const DEFAULT_PORT = 3010;

export function desktopPort(cfg) {
  const n = Number(cfg?.desktop?.port);
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : DEFAULT_PORT;
}

// Compose файлът се търси в РЕЛИЙЗА, не на произволно място — същият канон като
// autodeploy: това, което върви, идва от разгърнатия код.
export function composeFile(cfg) {
  const candidates = [
    cfg?.desktop?.composeFile,
    path.join(cfg?.paths?.currentLink || '/opt/few-few/current', 'vps-dashboard', 'deploy', 'desktop', 'docker-compose.yml'),
    // Спрямо САМИЯ модул — работи при всяко APP_DIR и в dev режим. Зашитият
    // `/opt/vps-dashboard` беше същата грешка, която вече поправихме в unit
    // файла: предполага една-единствена инсталация.
    path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'deploy', 'desktop', 'docker-compose.yml'),
  ].filter(Boolean);
  return candidates.find((p) => {
    try {
      return fs.statSync(p).isFile();
    } catch {
      return false;
    }
  }) || null;
}

// Паролата на самия десктоп живее в отделен файл до compose-а (mode 600), не в
// config.json и никога в репото — същото правило като restic.env.
export function envFile(cfg) {
  const f = composeFile(cfg);
  return f ? path.join(path.dirname(f), 'desktop.env') : null;
}

export async function status(cfg) {
  const file = composeFile(cfg);
  const env = envFile(cfg);
  const out = {
    available: Boolean(file),
    composeFile: file,
    envConfigured: Boolean(env && fs.existsSync(env)),
    port: desktopPort(cfg),
    running: false,
    state: null,
    health: null,
    error: null,
  };
  if (!file) {
    out.error = 'Няма deploy/desktop/docker-compose.yml в текущия release.';
    return out;
  }
  const r = await run('docker', ['inspect', '-f', '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}', CONTAINER], {
    timeout: 10000,
  });
  if (!r.ok) {
    // „Няма такъв контейнер" е НОРМАЛНО състояние (изключен е), не грешка.
    const msg = (r.stderr || '').toLowerCase();
    if (!msg.includes('no such object') && !msg.includes('no such container')) {
      out.error = (r.stderr || r.error || '').trim().slice(0, 200);
    }
    return out;
  }
  const [state, health] = r.stdout.trim().split('|');
  out.state = state || null;
  out.health = health || null;
  out.running = state === 'running';
  return out;
}

// Пускането/спирането минава през ЗАДАЧА с жив изход, защото първото дърпане на
// образа е ~2 GB и трае минути — тихо чакащ бутон е най-лошият вариант.
export function actionSpec(cfg, action) {
  if (!['up', 'down', 'pull'].includes(action)) {
    throw Object.assign(new Error('Невалидно действие'), { status: 400 });
  }
  const file = composeFile(cfg);
  if (!file) throw Object.assign(new Error('Няма compose файл за десктопа'), { status: 400 });
  const env = envFile(cfg);
  if (action !== 'down' && (!env || !fs.existsSync(env))) {
    throw Object.assign(
      new Error(`Липсва ${env || 'desktop.env'} — сложи там DESKTOP_PASSWORD (mode 600) и опитай пак.`),
      { status: 400 }
    );
  }
  const args = { up: 'up -d', down: 'down', pull: 'pull' }[action];
  return {
    title: `Десктоп: ${{ up: 'пускане', down: 'спиране', pull: 'обновяване на образа' }[action]}`,
    shell: `cd ${JSON.stringify(path.dirname(file))} && docker compose --env-file desktop.env -f ${JSON.stringify(file)} ${args}`,
    exclusive: 'desktop',
    timeoutMs: 30 * 60 * 1000,
  };
}

// ── Прокси ───────────────────────────────────────────────────────────────────
// Обикновени заявки. Пътят се препраща КАКТО Е (`/desktop/...`), защото
// контейнерът е нагласен със `SUBFOLDER=/desktop/` — тоест той сам очаква
// префикса. Отрязването му тук би счупило вътрешните му връзки.
export function proxyHttp(cfg, req, res) {
  const port = desktopPort(cfg);
  const headers = { ...req.headers };
  delete headers.cookie; // сесията на панела няма работа в чуждия контейнер
  delete headers.authorization;
  headers.host = `127.0.0.1:${port}`;
  const up = http.request(
    { host: '127.0.0.1', port, path: req.url, method: req.method, headers, timeout: 30000 },
    (r) => {
      res.writeHead(r.statusCode || 502, stripHop(r.headers));
      r.pipe(res);
    }
  );
  up.on('timeout', () => up.destroy(new Error('timeout')));
  up.on('error', (err) => {
    if (res.headersSent) return res.destroy();
    res.writeHead(502, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: `Десктопът не отговаря: ${err.message}` }));
  });
  req.pipe(up);
  res.on('close', () => up.destroy());
}

// WebSocket. Тук няма помощник в стандартната библиотека: пращаме ръчно
// ръкостискането нагоре и, ако мине, слепваме двата сокета байт за байт.
export function proxyUpgrade(cfg, req, socket, head) {
  const port = desktopPort(cfg);
  const headers = { ...req.headers };
  delete headers.cookie;
  delete headers.authorization;
  headers.host = `127.0.0.1:${port}`;
  const up = http.request({ host: '127.0.0.1', port, path: req.url, method: req.method, headers });
  up.on('upgrade', (upRes, upSocket, upHead) => {
    const lines = [`HTTP/1.1 ${upRes.statusCode} ${upRes.statusMessage}`];
    for (const [k, v] of Object.entries(upRes.headers)) {
      for (const one of Array.isArray(v) ? v : [v]) lines.push(`${k}: ${one}`);
    }
    socket.write(lines.join('\r\n') + '\r\n\r\n');
    if (upHead?.length) socket.unshift(upHead);
    upSocket.on('error', () => socket.destroy());
    socket.on('error', () => upSocket.destroy());
    upSocket.pipe(socket).pipe(upSocket);
  });
  up.on('response', (r) => {
    // Отказано надграждане — връщаме статуса, вместо да оставим сокета да виси.
    socket.write(`HTTP/1.1 ${r.statusCode} ${r.statusMessage}\r\n\r\n`);
    socket.destroy();
  });
  up.on('error', () => socket.destroy());
  if (head?.length) up.write(head);
  up.end();
}

const HOP = new Set(['connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer']);
function stripHop(h) {
  const out = {};
  for (const [k, v] of Object.entries(h)) if (!HOP.has(k.toLowerCase())) out[k] = v;
  return out;
}
