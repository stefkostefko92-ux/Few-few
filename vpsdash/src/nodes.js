// Federation между VPS-ите: същият панел върви на всеки сървър; този модул
// проксира /api/nodes/<id>/* към съответния peer с негов Bearer токен.
// Така единият панел управлява и двата VPS-а от един интерфейс (вкл. SSE).
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { probe } from './probe.js';
import { headerValue } from './notify.js';

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
  'cookie',
  'authorization',
  'content-length',
]);

// Единственото, което съседът може да каже за представянето на отговора си.
// Всичко останало (политики, бисквитки, CORS, кеш-директиви за нашия произход)
// е наше решение, не негово.
const PASS_THROUGH = new Set(['content-type', 'content-length', 'content-encoding', 'last-modified', 'etag']);

export function findPeer(cfg, id) {
  return (cfg.peers || []).find((p) => p.id === id) || null;
}

export function proxyToPeer(peer, req, res, restPath, search) {
  let target;
  try {
    target = new URL(peer.url);
  } catch {
    res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Невалиден peer URL' }));
    return;
  }
  const reqFn = target.protocol === 'https:' ? httpsRequest : httpRequest;
  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (!HOP_BY_HOP.has(k.toLowerCase())) headers[k] = v;
  }
  try {
    headers.authorization = `Bearer ${headerValue(peer.token, `Токенът за възел „${peer.id}"`)}`;
  } catch (err) {
    // Същият клас като при жетона за ntfy: стойност за HTTP хедър с нов ред или
    // не-latin1 знак кара Node да ХВЪРЛИ. Тук това стигаше до рутера като 500
    // „Вътрешна грешка" — без нито дума кой възел и защо.
    res.writeHead(502, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: err.message }));
    return;
  }
  headers['x-csd'] = '1'; // proxy заявките носят CSRF маркера — оригиналът вече е проверен локално

  const upstream = reqFn(
    {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || (target.protocol === 'https:' ? 443 : 80),
      path: `/api/${restPath}${search || ''}`,
      method: req.method,
      headers,
      timeout: 30000,
      // Peer-ите често са на вътрешни адреси със self-signed TLS — изрично opt-in.
      rejectUnauthorized: peer.insecureTls ? false : undefined,
    },
    (up) => {
      // СПИСЪК С РАЗРЕШЕНИ, не със забранени. Отговорът на съседа се сервира от
      // НАШИЯ произход: всеки негов хедър, който минава, действа тук. Списък със
      // забранени пропуска всичко, за което не сме се сетили — `Content-Security-
      // Policy` (по-слаба от нашата), `Access-Control-Allow-Origin: *`,
      // `Strict-Transport-Security`, `Clear-Site-Data`. Компрометиран съсед не
      // бива да пренаписва политиките на нашата страница; той доставя ДАННИ.
      const outHeaders = {};
      for (const [k, v] of Object.entries(up.headers)) {
        if (PASS_THROUGH.has(k.toLowerCase())) outHeaders[k] = v;
      }
      res.writeHead(up.statusCode || 502, outHeaders);
      up.pipe(res);
    }
  );
  upstream.on('timeout', () => {
    // SSE потоците нямат таймаут — но connect таймаутът пази от увиснал peer.
    if (!upstream.socket || upstream.socket.connecting) upstream.destroy(new Error('timeout'));
  });
  upstream.on('error', (err) => {
    if (!res.headersSent) {
      res.writeHead(502, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: `Peer недостъпен: ${err.message}` }));
    } else {
      res.end();
    }
  });
  req.pipe(upstream);
  res.on('close', () => upstream.destroy());
}

// ── Кръстосани проби ──────────────────────────────────────────────────────────
// Локална проба от същата машина НЕ хваща паднал Nginx, счупен DNS или мрежата
// на доставчика — тя тръгва отвътре. Затова всеки VPS сондира ПУБЛИЧНИТЕ URL-и
// на другия: външна гледна точка на нулева цена, без облачна услуга.
export async function crossProbe(cfg, peerId) {
  const peer = findPeer(cfg, peerId);
  if (!peer) throw Object.assign(new Error('Непознат възел'), { status: 404 });
  const targets = peer.probeTargets || [];
  if (!targets.length) {
    return { peer: peer.id, targets: [], note: 'Няма зададени probeTargets за този peer в конфига.' };
  }
  const results = await Promise.all(targets.map((t) => probe(t)));
  return { peer: peer.id, peerName: peer.name, targets: results, from: cfg.nodeId };
}

// Какво този възел трябва да сондира ЗА другите — четем го от собствения конфиг.
export function ownProbeTargets(cfg) {
  return cfg.probeTargets || [];
}

// Бърз статус на всички възли (за превключвателя в интерфейса).
export async function nodesStatus(cfg) {
  const peers = await Promise.all((cfg.peers || []).map((p) => peerStatus(p)));
  return {
    local: { id: cfg.nodeId, name: cfg.nodeName, up: true },
    peers,
  };
}

// Един съсед, изолиран. Всичко тук е в try/catch НАРОЧНО: преди това грешка в
// подготовката на заявката (напр. токен с нов ред → Node хвърля при задаване на
// хедъра) излизаше от изпълнителя на обещанието СИНХРОННО, `Promise.all`
// отхвърляше цялото, и `/api/nodes` връщаше 500 „Вътрешна грешка". Тоест един
// зле подаден токен скриваше СПИСЪКА С ВСИЧКИ ВЪЗЛИ — включително локалния,
// който е жив и няма нищо общо. Съсед се проваля САМ.
export function peerStatus(p) {
  return new Promise((resolve) => {
    const done = (v) => resolve({ id: p.id, name: p.name, ...v });
    let target;
    try {
      target = new URL(p.url);
    } catch {
      done({ up: false, error: 'невалиден URL' });
      return;
    }
    let auth;
    try {
      auth = `Bearer ${headerValue(p.token, `Токенът за „${p.id}"`)}`;
    } catch (err) {
      done({ up: false, error: err.message });
      return;
    }
    const reqFn = target.protocol === 'https:' ? httpsRequest : httpRequest;
    const started = Date.now();
    try {
      const rq = reqFn(
        {
          protocol: target.protocol,
          hostname: target.hostname,
          port: target.port || (target.protocol === 'https:' ? 443 : 80),
          path: '/api/ping',
          method: 'GET',
          headers: { authorization: auth },
          timeout: 5000,
          rejectUnauthorized: p.insecureTls ? false : undefined,
        },
        (up) => {
          const chunks = [];
          let size = 0;
          up.on('data', (c) => {
            size += c.length;
            // Отговорът на `/api/ping` е няколко реда. Съсед, който изсипва
            // мегабайти, е или счупен, или враждебен — и в двата случая не бива
            // да пълни паметта ни, докато решим това.
            if (size <= 16384) chunks.push(c);
          });
          up.on('end', () => {
            const ms = Date.now() - started;
            const status = up.statusCode;
            if (status !== 200) {
              // „Отказан достъп" и „машината я няма" са РАЗЛИЧНИ проблеми с
              // различни поправки. Слети в едно „недостъпен", човек часове
              // проверява мрежа заради изтекъл токен.
              done({
                up: false,
                status,
                ms,
                error: status === 401 || status === 403 ? 'отказан достъп (грешен токен?)' : `отговори ${status}`,
              });
              return;
            }
            let body = null;
            try {
              body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            } catch {
              done({ up: false, status, ms, error: 'отговорът не е JSON' });
              return;
            }
            // КОЙ отговори. Адрес, сочещ друга машина (копи-пейст, сменен DNS,
            // преместен peer), иначе минава за „наред" и панелът показва чужди
            // числа под името на нашия възел.
            const claimed = typeof body?.nodeId === 'string' ? body.nodeId : null;
            const mismatch = Boolean(claimed && p.id && claimed !== p.id);
            done({
              up: !mismatch,
              status,
              ms,
              nodeId: claimed,
              nodeName: typeof body?.nodeName === 'string' ? body.nodeName.slice(0, 80) : null,
              version: typeof body?.version === 'string' ? body.version.slice(0, 40) : null,
              identityMismatch: mismatch || undefined,
              error: mismatch ? `представя се за „${claimed}", а очакваме „${p.id}"` : undefined,
            });
          });
          up.on('error', (err) => done({ up: false, error: err.message, ms: Date.now() - started }));
        }
      );
      rq.on('timeout', () => rq.destroy(new Error('не отговори за 5 s')));
      rq.on('error', (err) => done({ up: false, error: err.message, ms: Date.now() - started }));
      rq.end();
    } catch (err) {
      // Предпазна мрежа без известен днес спусък: `new URL` вече отсява
      // невалидните адреси, а токенът минава проверка по-горе. Стои, защото
      // цената е три реда, а алтернативата — един съсед да събори списъка с
      // всички — вече се е случвала веднъж по друг път.
      done({ up: false, error: err.message });
    }
  });
}
