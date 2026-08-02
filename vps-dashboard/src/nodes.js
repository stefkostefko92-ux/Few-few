// Federation между VPS-ите: същият панел върви на всеки сървър; този модул
// проксира /api/nodes/<id>/* към съответния peer с негов Bearer токен.
// Така единият панел управлява и двата VPS-а от един интерфейс (вкл. SSE).
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { probe } from './probe.js';

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
  headers.authorization = `Bearer ${peer.token}`;
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
      const outHeaders = {};
      for (const [k, v] of Object.entries(up.headers)) {
        if (!HOP_BY_HOP.has(k.toLowerCase()) && k.toLowerCase() !== 'set-cookie') outHeaders[k] = v;
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
  const peers = await Promise.all(
    (cfg.peers || []).map(
      (p) =>
        new Promise((resolve) => {
          let target;
          try {
            target = new URL(p.url);
          } catch {
            resolve({ id: p.id, name: p.name, up: false, error: 'невалиден URL' });
            return;
          }
          const reqFn = target.protocol === 'https:' ? httpsRequest : httpRequest;
          const started = Date.now();
          const rq = reqFn(
            {
              protocol: target.protocol,
              hostname: target.hostname,
              port: target.port || (target.protocol === 'https:' ? 443 : 80),
              path: '/api/ping',
              method: 'GET',
              headers: { authorization: `Bearer ${p.token}` },
              timeout: 5000,
              rejectUnauthorized: p.insecureTls ? false : undefined,
            },
            (up) => {
              up.resume();
              resolve({ id: p.id, name: p.name, up: up.statusCode === 200, ms: Date.now() - started });
            }
          );
          rq.on('timeout', () => rq.destroy(new Error('timeout')));
          rq.on('error', (err) => resolve({ id: p.id, name: p.name, up: false, error: err.message }));
          rq.end();
        })
    )
  );
  return {
    local: { id: cfg.nodeId, name: cfg.nodeName, up: true },
    peers,
  };
}
