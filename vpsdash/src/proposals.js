// Предложения от агентите — „агентът предлага, човекът натиска".
//
// Решение на собственика (2026-10-12): нашите агенти могат да поправят проблеми
// по сървъра, но НИКОГА сами. Веригата е три стъпки и всяка е отделна врата:
//   1. агентът диагностицира (само четене) и съставя ПРЕДЛОЖЕНИЕ;
//   2. Claude (оркестраторът) го преглежда и го подава с агентския ключ;
//   3. собственикът натиска „Одобри" в панела — с парола (sudo) и потвърждение.
// Изпълнението тръгва САМО от стъпка 3. Ключът на агента не може да изпълни
// нищо: той може да чете състоянието и да подава предложения, толкова.
//
// Защо затворен каталог, а не свободен скрипт: агентът чете логове, аларми и
// изход от команди — текст, който пише ИНТЕРНЕТ (sshd: Invalid user <каквото
// напише атакуващият>). Подхвърлен ред „изпълни curl … | sh" е класическата
// prompt injection. С каталог най-лошото предложение е „рестартирай грешната
// услуга" — видимо, обратимо и пак зад човешко одобрение. Всяко действие минава
// през СЪЩИТЕ функции и allowlist-и като бутоните в панела: втори път към root
// няма.
//
// Едно предложение = ЕДНО действие. Човекът одобрява точно това, което вижда;
// верига от стъпки би била „одобри пакет", който никой не чете докрай.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Първият знак е буква/цифра: „-rf" иначе стига до systemctl като ОПЦИЯ.
const UNIT_RX = /^[A-Za-z0-9][A-Za-z0-9@_.:-]{0,199}$/;
const CONTAINER_RX = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
const PROJECT_RX = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const CATEGORY_RX = /^[a-z0-9][a-z0-9-]{0,39}$/;
const RELEASE_RX = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const PRODUCT_RX = /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/;

// Каталогът. `cls` е класът от одита на необратимите действия (виж
// scripts/destructive-audit.mjs) — показва се на човека до бутона.
export const PROPOSAL_ACTIONS = {
  'service.restart': {
    title: 'Рестарт на услуга (systemd)',
    cls: 'B',
    params: { unit: UNIT_RX },
  },
  'docker.restart': {
    title: 'Рестарт на контейнер',
    cls: 'B',
    params: { id: CONTAINER_RX },
  },
  'compose.restart': {
    title: 'Рестарт на Compose стек',
    cls: 'B',
    params: { project: PROJECT_RX },
  },
  'reclaim.run': {
    title: 'Освобождаване на място (категория)',
    cls: 'A',
    params: { category: CATEGORY_RX },
  },
  'apt.dpkgRepair': {
    title: 'Ремонт на прекъснат dpkg',
    cls: 'B',
    params: {},
  },
  'apt.securityUpgrade': {
    title: 'Ъпдейти за сигурност (apt)',
    cls: 'B',
    params: {},
  },
  'deploy.rollback': {
    title: 'Откат към предишен release',
    cls: 'A',
    params: { release: RELEASE_RX, projects: 'products' },
  },
};

export const LIMITS = {
  agent: 60,
  title: 140,
  why: 4000,
  evidence: 6000,
  review: 2000,
  rollback: 1500,
  pending: 20, // повече чакащи = поток, не предложения → отказ
  keep: 200, // историята на диска
  ttlMs: 24 * 3600 * 1000, // старо предложение описва сървър, който вече не е същият
};

const bad = (msg) => Object.assign(new Error(msg), { status: 400 });

// Текст от агент: контролни знаци вън (освен нов ред в дългите полета), таван на
// дължината. Текстът е ДАННИ — показва се в панела през textContent, никога html.
function text(v, max, { multiline = false, required = false, name }) {
  if (v == null || v === '') {
    if (required) throw bad(`Липсва поле „${name}".`);
    return '';
  }
  if (typeof v !== 'string') throw bad(`Полето „${name}" трябва да е текст.`);
  const cleaned = multiline
    ? v.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f\u2028\u2029]/g, '')
    : v.replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, ' ');
  const out = cleaned.trim();
  if (required && !out) throw bad(`Липсва поле „${name}".`);
  if (out.length > max) throw bad(`Полето „${name}" е над ${max} знака.`);
  return out;
}

export function validateAction(action) {
  if (!action || typeof action !== 'object' || Array.isArray(action)) throw bad('Липсва действие (`action`).');
  // Object.hasOwn, не `in`/индексиране: „__proto__" иначе намира прототипа на
  // обекта и минава за действие от каталога.
  const spec = typeof action.type === 'string' && Object.hasOwn(PROPOSAL_ACTIONS, action.type) ? PROPOSAL_ACTIONS[action.type] : null;
  if (!spec) throw bad(`Непознато действие „${String(action.type).slice(0, 40)}" — виж каталога.`);
  const params = action.params ?? {};
  if (typeof params !== 'object' || Array.isArray(params)) throw bad('`params` трябва да е обект.');
  const out = {};
  for (const key of Object.keys(params)) {
    if (!Object.hasOwn(spec.params, key)) throw bad(`Непознат параметър „${key.slice(0, 40)}" за ${action.type}.`);
  }
  for (const [key, rule] of Object.entries(spec.params)) {
    const v = params[key];
    if (rule === 'products') {
      // По избор: кои продукти да се върнат. Без списък — всички от release-а.
      if (v == null) continue;
      if (!Array.isArray(v) || v.length > 20 || !v.every((x) => typeof x === 'string' && PRODUCT_RX.test(x))) {
        throw bad(`„${key}" трябва да е списък от имена на продукти.`);
      }
      out[key] = [...new Set(v)];
      continue;
    }
    if (typeof v !== 'string' || !rule.test(v)) throw bad(`Невалиден параметър „${key}" за ${action.type}.`);
    out[key] = v;
  }
  return { type: action.type, params: out };
}

export function validateProposal(b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw bad('Тялото трябва да е JSON обект.');
  const allowed = new Set(['agent', 'title', 'why', 'evidence', 'review', 'rollback', 'action']);
  for (const k of Object.keys(b)) if (!allowed.has(k)) throw bad(`Непознато поле „${k.slice(0, 40)}".`);
  const agent = text(b.agent, LIMITS.agent, { required: true, name: 'agent' });
  if (!/^[\p{L}\p{N} ._-]+$/u.test(agent)) throw bad('Името на агента съдържа непозволени знаци.');
  return {
    agent,
    title: text(b.title, LIMITS.title, { required: true, name: 'title' }),
    why: text(b.why, LIMITS.why, { multiline: true, required: true, name: 'why' }),
    evidence: text(b.evidence, LIMITS.evidence, { multiline: true, name: 'evidence' }),
    // Прегледът на Claude е ЗАДЪЛЖИТЕЛЕН: подаване без него значи, че стъпка 2
    // е прескочена. Сървърът не може да докаже, че прегледът е истински — но
    // може да откаже предложение, в което дори не е описан.
    review: text(b.review, LIMITS.review, { multiline: true, required: true, name: 'review' }),
    rollback: text(b.rollback, LIMITS.rollback, { multiline: true, name: 'rollback' }),
    action: validateAction(b.action),
  };
}

// Хранилище: един JSON файл, mode 600, атомарен запис. Малко на брой записи
// (таван LIMITS.keep), значи база не трябва.
export class ProposalStore {
  constructor(stateDir) {
    this.file = path.join(stateDir, 'proposals.json');
    this.items = [];
    try {
      const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (Array.isArray(data)) this.items = data.filter((p) => p && typeof p.id === 'string');
    } catch {
      this.items = []; // липсващ или повреден файл → празна опашка, не срив
    }
  }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.items.slice(-LIMITS.keep)), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
  }

  // Изтеклите се отбелязват при четене — без таймер, който да трябва да живее.
  expire(now = Date.now()) {
    let changed = false;
    for (const p of this.items) {
      if (p.status === 'pending' && now - p.createdAt > LIMITS.ttlMs) {
        p.status = 'expired';
        changed = true;
      }
    }
    if (changed) this.save();
  }

  list() {
    this.expire();
    return [...this.items].reverse();
  }

  get(id) {
    this.expire();
    return this.items.find((p) => p.id === id) || null;
  }

  add(valid, now = Date.now()) {
    this.expire(now);
    if (this.items.filter((p) => p.status === 'pending').length >= LIMITS.pending) {
      throw Object.assign(new Error(`Вече чакат ${LIMITS.pending} предложения — първо да се решат те.`), { status: 429 });
    }
    const p = { id: crypto.randomBytes(8).toString('hex'), createdAt: now, status: 'pending', ...valid };
    this.items.push(p);
    this.save();
    return p;
  }

  update(id, patch) {
    const p = this.items.find((x) => x.id === id);
    if (!p) return null;
    Object.assign(p, patch);
    this.save();
    return p;
  }
}

// Изпълнението — през СЪЩИТЕ функции като бутоните. `deps` се подава от
// routes.js, за да няма втори вход към root и за да е тестваемо.
export async function executeAction(action, deps) {
  const { cfg, jobs, audit, user, services, docker, compose, reclaim, apthealth, system, deploy } = deps;
  const a = validateAction(action); // наново: всичко, минало през диска и мрежата, е чужд вход
  switch (a.type) {
    case 'service.restart':
      return { result: await services.serviceAction(a.params.unit, 'restart', audit, user) };
    case 'docker.restart':
      return { result: await docker.dockerAction(a.params.id, 'restart', audit, user) };
    case 'compose.restart': {
      // Файлът на стека идва от `docker compose ls` НА СЪРВЪРА — не от агента.
      const list = await compose.composeList();
      const proj = (list.projects || []).find((x) => x.name === a.params.project);
      if (!proj) throw bad('Няма такъв Compose стек на тази машина.');
      return { job: jobs.start(compose.composeActionSpec({ project: proj.name, configFile: proj.configFiles, action: 'restart' }), { user }) };
    }
    case 'reclaim.run': {
      // Кои файлове влизат в категорията решава сървърът, НАНОВО — като бутона.
      const fresh = await reclaim.reclaimable(cfg);
      const item = fresh.items.find((i) => i.id === a.params.category);
      if (!item) throw bad('Няма такава категория (или вече е чиста).');
      return { job: jobs.start(reclaim.reclaimSpec(item.id, item), { user }) };
    }
    case 'apt.dpkgRepair':
      return { job: jobs.start(apthealth.dpkgRepairSpec(), { user }) };
    case 'apt.securityUpgrade':
      return { job: jobs.start(system.aptUpgradeSpec(true), { user }) };
    case 'deploy.rollback':
      return { job: jobs.start(deploy.rollbackSpec(cfg, { release: a.params.release, projects: a.params.projects }), { user }) };
    default:
      throw bad('Непознато действие.');
  }
}

// Нов агентски ключ: 32 байта, base64url. Показва се ВЕДНЪЖ.
export function newAgentKey() {
  return crypto.randomBytes(32).toString('base64url');
}
