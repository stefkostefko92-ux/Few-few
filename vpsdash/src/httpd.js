// Минимален HTTP слой: рутер с path параметри, JSON тяло, статични файлове, SSE.
// Нула зависимости — node:http + node:fs. Fail-closed: непозната грешка → 500 без stack.
import fs from 'node:fs';
import path from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

export class Router {
  constructor() {
    this.routes = [];
  }

  on(method, pattern, handler) {
    // pattern: "/api/services/:action" или префикс с "*": "/api/nodes/:id/*"
    const keys = [];
    const rx = pattern
      .split('/')
      .map((seg) => {
        if (seg === '*') return '(?<rest>.*)';
        if (seg.startsWith(':')) {
          keys.push(seg.slice(1));
          return `(?<${seg.slice(1)}>[^/]+)`;
        }
        return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      })
      .join('/');
    this.routes.push({ method, rx: new RegExp(`^${rx}$`), handler });
    return this;
  }

  get(p, h) {
    return this.on('GET', p, h);
  }

  post(p, h) {
    return this.on('POST', p, h);
  }

  match(method, pathname) {
    for (const r of this.routes) {
      if (r.method !== method && r.method !== '*') continue;
      const m = r.rx.exec(pathname);
      if (m) return { handler: r.handler, params: m.groups || {} };
    }
    return null;
  }
}

export function sendJson(res, status, data) {
  // headersSent, не само writableEnded: ако отговорът вече е започнал (напр. отворен
  // SSE поток), повторният writeHead хвърля ERR_HTTP_HEADERS_SENT вътре в catch на
  // async handler → unhandled rejection → Node сваля ПРОЦЕСА. Тук се затваря целият
  // клас „грешка след като отговорът е тръгнал".
  if (res.writableEnded || res.headersSent) return;
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(body);
}

export function sendError(res, status, message) {
  sendJson(res, status, { error: message });
}

export async function readBody(req, { limit = 512 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error('Тялото е твърде голямо'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export async function readJson(req) {
  const buf = await readBody(req);
  if (!buf.length) return {};
  let parsed;
  try {
    parsed = JSON.parse(buf.toString('utf8'));
  } catch {
    throw Object.assign(new Error('Невалиден JSON'), { status: 400 });
  }
  // `null`, `0`, `"низ"` и `[]` са ВАЛИДЕН JSON, но не са тяло на заявка. Всеки
  // маршрут после прави `body.поле` и получава TypeError → 500 „Вътрешна грешка".
  // Това е същата лъжа като при системните грешки: вината е на подателя, а 5xx
  // хранят SLO и алармата за процент грешки. Празният обект е и по-безопасната
  // стойност: маршрутът вижда липсващи полета и си вдига своята 400 с обяснение,
  // вместо да гръмне на първото четене.
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw Object.assign(new Error('Тялото трябва да е JSON обект.'), { status: 400 });
  }
  return parsed;
}

export function parseCookies(req) {
  const out = {};
  const header = req.headers.cookie;
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0) out[part.slice(0, eq).trim()] = decodeURIComponent(part.slice(eq + 1).trim());
  }
  return out;
}

// SSE: отваря поток и връща helper-и; пази клиента жив с коментар на всеки 25s.
export function openSse(res) {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-store',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
  res.write(':ok\n\n');
  const ping = setInterval(() => {
    if (!res.writableEnded) res.write(':ping\n\n');
  }, 25000);
  ping.unref?.(); // да не държи процеса жив само заради поддържащия сигнал
  res.on('close', () => clearInterval(ping));
  return {
    // ВСИЧКО се праща като JSON — включително обикновените низове.
    // Причината: в SSE „\r" е валиден край на ред, затова суровият текст губи
    // carriage return-ите по пътя. За терминала това е фатално (курсорът никога
    // не се връща в началото на реда и TUI изгледът се разпада); за логовете и
    // изхода на задачите чупи лентите за напредък. JSON екранира \r и \n, така
    // че байтовете стигат непокътнати. Клиентът винаги прави JSON.parse.
    send(event, data) {
      if (res.writableEnded) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    },
    close() {
      clearInterval(ping);
      if (!res.writableEnded) res.end();
    },
  };
}

// Статични файлове от public/ — resolve + префикс проверка срещу path traversal.
export function serveStatic(rootDir) {
  const root = path.resolve(rootDir);
  return (req, res, pathname) => {
    let rel = pathname === '/' ? '/index.html' : pathname;
    const full = path.resolve(root, '.' + rel);
    if (!full.startsWith(root + path.sep) && full !== root) {
      sendError(res, 403, 'Забранен път');
      return true;
    }
    let stat;
    try {
      stat = fs.statSync(full);
    } catch {
      return false;
    }
    if (!stat.isFile()) return false;
    res.writeHead(200, {
      'content-type': MIME[path.extname(full)] || 'application/octet-stream',
      'cache-control': rel === '/index.html' ? 'no-store' : 'public, max-age=3600',
      'x-content-type-options': 'nosniff',
    });
    // Слушателят за грешки е задължителен: необработен `'error'` на поток е
    // НЕУЛОВЕНО изключение и сваля целия процес. Прозорецът е реален —
    // `autodeploy.sh` подменя `public/` под живия панел, тоест между `statSync`
    // и `open` файлът може да изчезне. Панелът да пада, защото някой е деплойнал,
    // е точно обратното на предназначението му.
    fs.createReadStream(full)
      .on('error', () => res.destroy())
      .pipe(res);
    return true;
  };
}

// Реалният клиентски IP зад прокси. ВНИМАНИЕ: най-левият елемент на
// X-Forwarded-For е този, който КЛИЕНТЪТ е пратил — Nginx с
// `$proxy_add_x_forwarded_for` само ДОБАВЯ реалния адрес отдясно. Ако лимитерът
// на входа брои левия, всеки го заобикаля с ротиращ хедър. Затова: X-Real-IP
// (нашият Nginx го слага от $remote_addr, клиентът не може да го подправи), иначе
// НАЙ-ДЕСНИЯТ елемент на XFF — добавеният от нашето прокси.
export function clientIp(req, trustProxy) {
  if (trustProxy) {
    const real = req.headers['x-real-ip'];
    if (real) return String(real).split(',').pop().trim();
    const xf = req.headers['x-forwarded-for'];
    if (xf) {
      const parts = String(xf).split(',');
      return parts[parts.length - 1].trim();
    }
  }
  return req.socket.remoteAddress || '?';
}
