// Изнасяне на одита към другия VPS.
//
// Хеш-веригата ХВАЩА подправяне, но root може да пренапише целия файл наведнъж и
// веригата пак ще е „валидна". Единствената истинска защита е копие на машина,
// до която нападателят няма достъп. Federation-ът вече го може — остава да го
// ползваме: всеки възел бута новите си записи към peer-а, който ги пази ОТДЕЛНО.
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import fs from 'node:fs';
import path from 'node:path';

export class AuditShipper {
  constructor({ cfg, audit }) {
    this.cfg = cfg;
    this.audit = audit;
    this.stateFile = path.join(cfg.paths.stateDir, 'audit-ship.json');
    this.cursors = this.load();
  }

  load() {
    try {
      return JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
    } catch {
      return {};
    }
  }

  save() {
    try {
      fs.writeFileSync(this.stateFile, JSON.stringify(this.cursors), { mode: 0o600 });
    } catch {
      /* не чупим изнасянето заради диска */
    }
  }

  start() {
    if (!this.cfg.auditShip?.enabled) return;
    const every = Math.max(60, Number(this.cfg.auditShip.intervalSec) || 300) * 1000;
    const tick = () => this.shipAll().catch(() => {});
    setTimeout(tick, 30000);
    this.timer = setInterval(tick, every);
    this.timer.unref?.();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  async shipAll() {
    const out = [];
    for (const peer of this.cfg.peers || []) {
      out.push(await this.shipTo(peer).catch((e) => ({ peer: peer.id, ok: false, error: e.message })));
    }
    // Резултатът се ЗАПОМНЯ, а не само се връща.
    //
    // Дотук цикълът беше `this.shipAll().catch(() => {})` — тоест провалът се
    // изяждаше напълно, а `status()` показваше само курсорите, които при провал
    // просто не мърдат. Значи копието на одита в другия VPS можеше да е мъртво
    // със седмици и нищо да не го каже. Това е контролът срещу подправяне: ако
    // някой вземе root, локалният дневник е негов — единственото, което остава,
    // е копието отвън. Мълчаливо спряло копие е по-лошо от липсващо, защото
    // създава увереност.
    this.lastRunAt = Date.now();
    this.lastResults = out;
    if (out.length && out.every((r) => r.ok)) this.lastOkAt = Date.now();
    return out;
  }

  async shipTo(peer) {
    const cursor = this.cursors[peer.id] || 'GENESIS';
    const batch = this.audit.since(cursor, 300);
    if (!batch.entries.length) return { peer: peer.id, ok: true, sent: 0 };

    const res = await postJson(peer, '/api/audit/mirror', {
      node: this.cfg.nodeId,
      entries: batch.entries,
    });
    if (!res.ok) return { peer: peer.id, ok: false, error: res.error || `HTTP ${res.status}` };

    this.cursors[peer.id] = batch.lastHash;
    this.save();
    return { peer: peer.id, ok: true, sent: batch.entries.length, remaining: batch.remaining };
  }

  status() {
    return {
      enabled: Boolean(this.cfg.auditShip?.enabled),
      intervalSec: this.cfg.auditShip?.intervalSec || 300,
      cursors: this.cursors,
      mirrors: this.audit.mirrors(),
      lastRunAt: this.lastRunAt || null,
      lastOkAt: this.lastOkAt || null,
      lastResults: this.lastResults || [],
    };
  }
}

function postJson(peer, pathname, body) {
  return new Promise((resolve) => {
    let target;
    try {
      target = new URL(peer.url);
    } catch {
      resolve({ ok: false, error: 'невалиден peer URL' });
      return;
    }
    const payload = Buffer.from(JSON.stringify(body), 'utf8');
    const reqFn = target.protocol === 'https:' ? httpsRequest : httpRequest;
    const req = reqFn(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || (target.protocol === 'https:' ? 443 : 80),
        path: pathname,
        method: 'POST',
        timeout: 20000,
        headers: {
          'content-type': 'application/json',
          'content-length': payload.length,
          authorization: `Bearer ${peer.token}`,
          'x-csd': '1',
        },
        rejectUnauthorized: peer.insecureTls ? false : undefined,
      },
      (res) => {
        res.resume();
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode });
      }
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', (err) => resolve({ ok: false, error: err.message }));
    req.end(payload);
  });
}
