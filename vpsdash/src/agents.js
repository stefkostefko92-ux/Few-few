// Агентският слой — панелът чете флота от текущия release (agents-dashboard/
// agents.json) и пуска „ръцете“ на агентите (tools/…) като фонови задачи.
// Allowlist-first: изпълняват се САМО изброените тук инструменти, нищо друго.
import fs from 'node:fs';
import path from 'node:path';

// id → { title, args, owner (кой агент владее инструмента), mutating }
export const AGENT_TOOLS = {
  'agents-oversee': {
    title: 'Интегритет на флота (oversee)',
    owner: 'AI-джията',
    args: ['tools/agents/oversee.mjs'],
  },
  'agents-token-budget': {
    title: 'Токен-бюджет на агентите',
    owner: 'AI-джията',
    args: ['tools/agents/token-budget.mjs', '--check'],
  },
  'agents-drift-lint': {
    title: 'Дрейф/консистентност на ростера',
    owner: 'AI-джията',
    args: ['tools/agents/drift-lint.mjs'],
  },
  'agents-loop-audit': {
    title: 'Одит на автономните loops (L1→L3)',
    owner: 'AI-джията',
    args: ['tools/agents/loops/loop-audit.mjs'],
  },
  'agents-recovery-audit': {
    title: 'Одит провал→възстановяване',
    owner: 'AI-джията',
    args: ['tools/agents/recovery-audit.mjs'],
  },
  'agents-consistency': {
    title: 'Консистентност на паметта',
    owner: 'AI-джията',
    args: ['tools/agents/consistency-audit.mjs'],
  },
  'security-secret-scan': {
    title: 'Сканиране за тайни (secret-scan)',
    owner: 'Кодаджията',
    args: ['tools/security/secret-scan.mjs'],
  },
  'vps-deploy-check': {
    title: 'Линт на деплой скриптовете',
    owner: 'VPS-аджията',
    args: ['tools/vps/deploy-check.mjs', 'deploy/autodeploy.sh'],
  },
  'skills-lint': {
    title: 'Линт на skills пакетите',
    owner: 'AI-джията',
    args: ['tools/skills/lint.mjs'],
  },
};

export function agentsFleet(cfg) {
  const file = path.join(cfg.paths.currentLink, 'agents-dashboard', 'agents.json');
  let data = null;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return { available: false, error: 'Няма agents.json в текущия release (деплойни архива първо).' };
  }
  const agents = (data.agents || []).map((a) => ({
    id: a.id,
    name: a.name,
    title: a.title,
    emoji: a.emoji,
    accent: a.accent,
    model: a.model,
    effort: a.effort,
    status: a.status,
    tagline: a.tagline,
    tools: a.tools,
    versions: Array.isArray(a.evolution) ? a.evolution.length : 0,
    latest: Array.isArray(a.evolution) && a.evolution.length ? a.evolution[a.evolution.length - 1] : null,
  }));
  return { available: true, meta: data.meta || {}, agents };
}

export function listAgentTools(cfg) {
  const root = cfg.paths.currentLink;
  // `root` се връща изрично: „липсва" без път е съобщение, не диагноза. Целият
  // слой зависи от ЕДИН symlink (`current`), а когато той сочи накриво, всеки
  // инструмент поотделно изглежда изчезнал — човек тръгва да търси скриптове,
  // вместо да погледне връзката. Пътят на екрана превръща десет еднакви „липсва"
  // в един очевиден въпрос.
  return {
    root,
    // Разликата „връзката я няма" ↔ „връзката сочи към дърво без tools/" е
    // първото, което човек трябва да види: втората значи разгърнат, но непълен
    // архив, а първата — че деплоят не е стигнал до маркирането на release-а.
    rootExists: fs.existsSync(root),
    tools: Object.entries(AGENT_TOOLS).map(([id, t]) => ({
      id,
      title: t.title,
      owner: t.owner,
      script: t.args[0],
      present: fs.existsSync(path.join(root, t.args[0])),
    })),
  };
}

export function agentToolSpec(cfg, toolId) {
  const tool = AGENT_TOOLS[toolId];
  if (!tool) throw Object.assign(new Error('Непознат инструмент'), { status: 400 });
  const root = cfg.paths.currentLink;
  if (!fs.existsSync(path.join(root, tool.args[0]))) {
    throw Object.assign(new Error(`Скриптът липсва в текущия release: ${tool.args[0]}`), { status: 400 });
  }
  return {
    title: tool.title,
    cmd: 'node',
    args: tool.args,
    cwd: root,
    timeoutMs: 10 * 60 * 1000,
  };
}

// Памети на агентите — само списък + размер (само-четене, без тайни: паметта е
// hook-защитена, но не показваме съдържание през мрежата по подразбиране).
export function agentMemories(cfg) {
  const dir = path.join(cfg.paths.currentLink, '.claude', 'agents', '_memory');
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.md'))
      .map((f) => {
        const st = fs.statSync(path.join(dir, f));
        return { file: f, sizeBytes: st.size, mtime: st.mtime.toISOString() };
      });
  } catch {
    return [];
  }
}
