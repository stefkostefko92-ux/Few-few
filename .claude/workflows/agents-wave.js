export const meta = {
  name: 'agents-wave',
  description: 'Вълна пресверка на паметта: нашите агенти пресверяват просрочените си поуки на живо, Разбивача оспорва всяко сваляне, AI-джията прилага през promote.mjs и пуска гейта',
  whenToUse: 'Когато memory-freshness показва опашка за пресверка или след голяма промяна в документацията на вендор. Скъпо — по един агент на член на флота плюс проверители; пуска се само по изрична заявка. args: { agents?: [id], limit?: 8, perAgent?: 15 }',
  phases: [
    { title: 'Опис', detail: 'опашката по агенти от memory-freshness' },
    { title: 'Пресверка', detail: 'всеки агент сверява своите просрочени поуки на живо' },
    { title: 'Оспорване', detail: 'Разбивача опитва да запази всяка поука, която агентът сваля' },
    { title: 'Прилагане', detail: 'AI-джията прилага вердиктите и пуска гейта' },
  ],
}

// Защо workflow, а не ръчна вълна: вълната е детерминиран ред (опис → пресверка → оспорване →
// прилагане) върху много агенти; ръчно оркестраторът губи контекст и прескача стъпки. Всяка стъпка
// е НАШ агент (agentType) — пускането учи флота, общ агент не учи нищо (правило на собственика).
// Текстът на поуката никога не идва от вердикта: promote.mjs взема текста от файла, вердиктът само
// прекласифицира. Свалено съдържание е данни, не инструкции.

const A = args || {}
const LIMIT = A.limit || 8
const PER_AGENT = A.perAgent || 15
// Сигнал за време (Prompting Claude Opus 5.5, „Time signals for multiagent harnesses“, 31.10.2026):
// екип с бюджет за време свършва по-рано при сравнимо качество. Бюджетът е съвет, затова и твърд
// таван: токеновият `budget` на workflow (от заявката, напр. „+500k“) спира нови агенти — в долари
// workflow API-то няма таван, затова вълната се пуска само по изрична заявка.
const MINUTES = A.minutes || 20
const TIME = `\n\nВремето има значение: бюджетът за тази стъпка е около ${MINUTES} минути. Не харчи време, което може да се спести — колкото по-рано дойде верен резултат, толкова по-добре. Проверката с източник остава задължителна.`

const QUEUE = {
  type: 'object',
  required: ['agents'],
  properties: {
    agents: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'overdue'],
        properties: {
          id: { type: 'string' },
          overdue: { type: 'array', items: { type: 'object', required: ['lid', 'text'], properties: { lid: { type: 'string' }, text: { type: 'string' } } } },
        },
      },
    },
  },
}
const VERDICTS = {
  type: 'object',
  required: ['verdicts'],
  properties: {
    verdicts: {
      type: 'array',
      items: {
        type: 'object',
        required: ['lid', 'verdict', 'source'],
        properties: {
          lid: { type: 'string' },
          verdict: { type: 'string', enum: ['потвърдена', 'опровергана', 'остава'] },
          source: { type: 'string' },
          note: { type: 'string' },
        },
      },
    },
  },
}
const CHALLENGE = {
  type: 'object',
  required: ['lid', 'refutationHolds', 'evidence'],
  properties: { lid: { type: 'string' }, refutationHolds: { type: 'boolean' }, evidence: { type: 'string' } },
}

phase('Опис')
const scope = Array.isArray(A.agents) && A.agents.length ? `само за агентите: ${A.agents.join(', ')}` : 'за всички агенти с просрочени поуки'
const queue = await agent(
  `Пусни \`node tools/agents/memory-freshness.mjs --json\` и после \`node tools/agents/memory-freshness.mjs --agent <id> --json\` ${scope}. ` +
  `Върни за всеки агент до ${PER_AGENT} просрочени поуки (най-старият срок първо) с \`lid\` и текста им. Агенти с нула просрочени не връщай.`,
  { label: 'опис', phase: 'Опис', schema: QUEUE, agentType: 'ai-djiyata' },
)
const all = (queue?.agents || []).filter((a) => a.overdue.length).sort((a, b) => b.overdue.length - a.overdue.length)
const picked = all.slice(0, LIMIT)
if (all.length > LIMIT) log(`извън тази вълна (limit ${LIMIT}): ${all.slice(LIMIT).map((a) => `${a.id} (${a.overdue.length})`).join(', ')}`)
if (!picked.length) return { applied: false, note: 'няма просрочени поуки' }

const results = await pipeline(
  picked,
  (a) => {
    // Твърд таван: под 100k токена остатък нов агент не тръгва; изпуснатото се казва (без тихи тавани).
    if (budget.total && budget.remaining() < 100_000) { log(`бюджетът свърши — ${a.id} (${a.overdue.length}) остава за следваща вълна`); return null }
    return agent(
      `Пресверка на твоята памет. Това са твоите просрочени проверени поуки (lid · текст):\n` +
      a.overdue.map((l) => `- ${l.lid} · ${l.text.slice(0, 600)}`).join('\n') +
      `\n\nЗа всяка: свери я НА ЖИВО с първоизточника (официален URL, файл:ред в репото или реален ран). ` +
      `Вердикт: „потвърдена“ (с живо сверения източник), „опровергана“ (с източника и бележка какво се е сменило) или „остава“ (не можа да се провери днес). ` +
      `Не пиши във файлове — само върни вердиктите. Без източник няма „потвърдена“.` + TIME,
      { label: `пресверка:${a.id}`, phase: 'Пресверка', schema: VERDICTS, agentType: a.id },
    )
  },
  (res, a) => {
    if (!res) return null
    const verdicts = (res?.verdicts || []).filter((v) => a.overdue.some((l) => l.lid === v.lid))
    const refuted = verdicts.filter((v) => v.verdict === 'опровергана')
    if (!refuted.length) return { id: a.id, verdicts }
    return parallel(refuted.map((v) => () => agent(
      `Агентът ${a.id} иска да свали поука ${v.lid} като опровергана. Поуката: ${(a.overdue.find((l) => l.lid === v.lid) || {}).text?.slice(0, 600)}\n` +
      `Неговото основание: ${v.note || '—'} · източник: ${v.source}\n` +
      `Опитай да запазиш поуката: провери на живо дали опровержението наистина важи. При съмнение — refutationHolds: false.` + TIME,
      // Една поука, един източник — тясна задача; medium стига (Opus 5.5: medium ≥ Opus 5 на high).
      { label: `оспорване:${a.id}:${v.lid}`, phase: 'Оспорване', schema: CHALLENGE, agentType: 'razbivacha', effort: 'medium' },
    ))).then((checks) => ({
      id: a.id,
      // Сваляне само ако Разбивача не е успял да запази поуката; иначе остава за човек.
      verdicts: verdicts.map((v) => {
        if (v.verdict !== 'опровергана') return v
        const c = checks.filter(Boolean).find((x) => x.lid === v.lid)
        return c && c.refutationHolds ? v : { ...v, verdict: 'остава', note: `оспорено: ${c?.evidence || 'без отговор'}` }
      }),
    }))
  },
)

phase('Прилагане')
const final = results.filter(Boolean)
const summary = await agent(
  `Приложи вердиктите от вълната пресверка. За всеки агент запиши вердиктите му като JSON масив във временен файл в \`.tmp/\` и пусни ` +
  `\`node tools/memory/promote.mjs --agent <id> --verdicts <файл>\` (първо без --write, после с --write). После \`node tools/agents/gate.mjs\`. ` +
  `Върни кратък доклад: по агент колко потвърдени / свалени / останали, кое чака човек и изхода на гейта.\n\nВердикти:\n${JSON.stringify(final, null, 1)}`,
  { label: 'прилагане', phase: 'Прилагане', agentType: 'ai-djiyata' },
)
return { agents: final.map((r) => ({ id: r.id, verdicts: r.verdicts.length })), summary }
