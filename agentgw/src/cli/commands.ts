import { parseArgs } from 'node:util';
import { normalizeOrigin } from '../config.js';
import {
  AGENT_ID_RE,
  generateKey,
  hashKey,
  keyPrefix,
  microToUsd,
  monthKey,
  usdToMicro,
  type KeyRecord,
  type Store,
} from '../keys.js';

export const USAGE = `Употреба: npm run key -- <команда> [опции]

  create  --site <име> --agents a,b --origins https://сайт.bg[,…] --cap <USD> [--rate <N/мин>] [--secret]
          Създава ключ. Публичен (cs_pk_) по подразбиране — за уиджета, важи само от --origins.
          --secret → cs_sk_ за сървър-към-сървър (без --origins). Ключът се показва САМО веднъж.
  list    Всички ключове + разход за текущия месец.
  revoke  <id|префикс>                          Отменя ключа (необратимо).
  grant   <id|префикс> --agents a,b [--remove]  Добавя (или маха) позволени агенти.
  origins <id|префикс> --origins https://…[,…] [--remove]
  limit   <id|префикс> [--cap <USD>] [--rate <N/мин>]`;

export class CliError extends Error {}

const list = (v: string | undefined) =>
  (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

function parseAgents(v: string | undefined, known: Set<string>): string[] {
  const ids = list(v);
  for (const id of ids) {
    if (!AGENT_ID_RE.test(id)) throw new CliError(`Невалиден идентификатор на агент: ${id}`);
    if (!known.has(id)) throw new CliError(`Няма публичен профил за агент „${id}“`);
  }
  return ids;
}

function parseOrigins(v: string | undefined): string[] {
  return list(v).map((o) => {
    const n = normalizeOrigin(o);
    if (!n) throw new CliError(`Невалиден Origin (нужен е https://домейн): ${o}`);
    return n;
  });
}

function parseCap(v: string | undefined): bigint {
  const n = Number(v);
  if (v === undefined || !Number.isFinite(n) || n < 0 || n > 100_000)
    throw new CliError('--cap трябва да е сума в USD между 0 и 100000');
  return usdToMicro(n);
}

function parseRate(v: string | undefined, fallback: number): number {
  if (v === undefined) return fallback;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 600)
    throw new CliError('--rate трябва да е цяло число между 1 и 600');
  return n;
}

async function mustFind(store: Store, ref: string | undefined): Promise<KeyRecord> {
  if (!ref) throw new CliError('Посочи id или префикс на ключа');
  const key = await store.findKey(ref);
  if (!key) throw new CliError(`Няма (еднозначен) ключ „${ref}“`);
  return key;
}

function describe(k: KeyRecord): string {
  const kind = k.kind === 'PUBLIC' ? 'публичен' : 'таен';
  const state = k.active ? 'активен' : `отменен ${k.revokedAt?.toISOString().slice(0, 10) ?? ''}`;
  return [
    `${k.id}  ${k.prefix}  ${kind}  ${state}`,
    `  сайт: ${k.site}`,
    `  агенти: ${k.agents.join(', ') || '—'}`,
    `  origin-и: ${k.origins.join(', ') || '—'}`,
    `  таван: ${microToUsd(k.capMicroUsd)} USD/месец · лимит: ${k.ratePerMin}/мин на IP`,
  ].join('\n');
}

export interface CliDeps {
  store: Store;
  pepper: string;
  knownAgents: Set<string>;
  out: (line: string) => void;
}

export async function runKeyCommand(argv: string[], deps: CliDeps): Promise<void> {
  const { store, pepper, knownAgents, out } = deps;
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      site: { type: 'string' },
      agents: { type: 'string' },
      origins: { type: 'string' },
      cap: { type: 'string' },
      rate: { type: 'string' },
      secret: { type: 'boolean', default: false },
      remove: { type: 'boolean', default: false },
    },
  });
  const [cmd, ref] = positionals;
  const actor = `cli:${process.env.USER ?? 'unknown'}`;

  switch (cmd) {
    case 'create': {
      const site = values.site?.trim();
      if (!site) throw new CliError('--site е задължително');
      const kind = values.secret ? 'SECRET' : 'PUBLIC';
      const agents = parseAgents(values.agents, knownAgents);
      const origins = parseOrigins(values.origins);
      if (kind === 'PUBLIC' && origins.length === 0)
        throw new CliError('Публичният ключ иска поне един --origins (https://…)');
      if (kind === 'SECRET' && origins.length > 0)
        throw new CliError('Тайният ключ не се ползва от браузър — махни --origins');
      const plain = generateKey(kind);
      const rec = await store.createKey({
        kind,
        site,
        agents,
        origins,
        capMicroUsd: parseCap(values.cap),
        ratePerMin: parseRate(values.rate, 20),
        hash: hashKey(plain, pepper),
        prefix: keyPrefix(plain),
      });
      await store.audit({
        actor,
        action: 'key.create',
        keyId: rec.id,
        detail: { site, kind, agents, origins, cap: rec.capMicroUsd, rate: rec.ratePerMin },
      });
      out(describe(rec));
      out('');
      out(`КЛЮЧ (показва се само сега — запиши го на сигурно място):\n${plain}`);
      return;
    }
    case 'list': {
      const keys = await store.listKeys();
      if (keys.length === 0) out('Няма ключове.');
      const month = monthKey();
      for (const k of keys) {
        const u = await store.monthUsage(k.id, month);
        out(describe(k));
        out(`  ${month}: ${u.requests} заявки · ${microToUsd(u.costMicroUsd)} USD`);
      }
      return;
    }
    case 'revoke': {
      const key = await mustFind(store, ref);
      const rec = await store.updateKey(key.id, { revoke: true });
      await store.audit({ actor, action: 'key.revoke', keyId: rec.id });
      out(`Отменен: ${rec.prefix} (${rec.site})`);
      return;
    }
    case 'grant': {
      const key = await mustFind(store, ref);
      const ids = parseAgents(values.agents, knownAgents);
      if (ids.length === 0) throw new CliError('--agents е задължително');
      const agents = values.remove
        ? key.agents.filter((a) => !ids.includes(a))
        : [...new Set([...key.agents, ...ids])];
      const rec = await store.updateKey(key.id, { agents });
      await store.audit({
        actor,
        action: values.remove ? 'key.agents.remove' : 'key.agents.grant',
        keyId: rec.id,
        detail: { agents: ids },
      });
      out(describe(rec));
      return;
    }
    case 'origins': {
      const key = await mustFind(store, ref);
      if (key.kind !== 'PUBLIC') throw new CliError('Origin-и има само публичният ключ');
      const ids = parseOrigins(values.origins);
      if (ids.length === 0) throw new CliError('--origins е задължително');
      const origins = values.remove
        ? key.origins.filter((o) => !ids.includes(o))
        : [...new Set([...key.origins, ...ids])];
      const rec = await store.updateKey(key.id, { origins });
      await store.audit({
        actor,
        action: values.remove ? 'key.origins.remove' : 'key.origins.add',
        keyId: rec.id,
        detail: { origins: ids },
      });
      out(describe(rec));
      return;
    }
    case 'limit': {
      const key = await mustFind(store, ref);
      if (values.cap === undefined && values.rate === undefined)
        throw new CliError('Посочи --cap и/или --rate');
      const patch = {
        ...(values.cap !== undefined ? { capMicroUsd: parseCap(values.cap) } : {}),
        ...(values.rate !== undefined
          ? { ratePerMin: parseRate(values.rate, key.ratePerMin) }
          : {}),
      };
      const rec = await store.updateKey(key.id, patch);
      await store.audit({ actor, action: 'key.limit', keyId: rec.id, detail: patch });
      out(describe(rec));
      return;
    }
    default:
      throw new CliError(USAGE);
  }
}
