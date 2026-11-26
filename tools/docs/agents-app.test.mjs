// agents-app.test.mjs — данните на новото табло на агентите (карти по екипи, профили, чат).
//
// Таблото е ЕДИН файл зад CSP, а данните идват от репото (дефиниции, екипи, умения, памет) — всяка
// грешка тук е видима за собственика на телефона. Тестовете заковават: всички агенти и екипи са вътре,
// уменията и собствениците им са верни, чатът получава правилата си, а вграждането не може да затвори
// `<script>` блока (стойностите са данни, никога разметка).
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFrontmatter, skillOwners, buildAppData, embedJson, personaFor, TOOL_INFO } from "./agents-app.mjs";

const files = {
  "agents-dashboard/agents.json": JSON.stringify({
    meta: { updated: "2026-11-26" },
    agents: [
      { id: "kodadjiyata", name: "Кодаджията", title: "Ревю на код", emoji: "🛠", accent: "#3b82f6", tagline: "Лови бъгове.", model: "opus", effort: "medium", status: "active",
        tools: ["Read", "Grep", "Glob", "Bash"], mission: "Ревю за бъгове.", capabilities: ["XSS", "IDOR"],
        knowledge: { sources: 12, priorArt: ["OWASP"], lessons: 300 },
        evolution: [{ version: "1.0.0", date: "2026-07-01", event: "старт" }, { version: "68.6.0", date: "2026-11-24", event: "v68.6 — учене", detail: "Научи: нещо" }],
        recentLessons: [{ date: "2026-11-24", text: "Поука </script><img src=x onerror=alert(1)>", source: "a.js:1" }] },
      { id: "dizayner", name: "Дизайнера", title: "Визуални ефекти", accent: "#e11d48", tagline: "Уау.", model: "sonnet", effort: "medium",
        tools: ["Read", "Skill"], mission: "Ефекти.", capabilities: [], knowledge: { lessons: 10 }, evolution: [{ version: "3.2.0", date: "2026-11-20" }], recentLessons: [] },
    ],
  }),
  ".claude/agents/_teams.json": JSON.stringify({
    teams: [
      { id: "kod", name: "Ковачницата", mission: "Верен код.", lead: "kodadjiyata", members: ["kodadjiyata"], workflow: { name: "Промяна", steps: [{ agent: "kodadjiyata", does: "ревю" }] } },
      { id: "forma", name: "Формата", mission: "Визия.", lead: "dizayner", members: ["dizayner"] },
    ],
  }),
  ".claude/agents/kodadjiyata.md": "---\nname: kodadjiyata\ndescription: Кодаджията — ревю. Използвай при „прегледай“.\ntools: Read, Grep, Glob, Bash\nskills:\n  - agent-doctrine\nmodel: opus\n---\n\nТи си **„Кодаджията“**.\n",
  ".claude/agents/dizayner.md": "---\nname: dizayner\ndescription: >-\n  Дизайнера — ефекти.\n  Втори ред.\nskills:\n  - agent-doctrine\n  - frontend-design\n---\n\nТи си Дизайнера.\n",
  ".claude/skills/owasp-review/SKILL.md": "---\nname: owasp-review\ndescription: Преглед по OWASP. Собственик = агентът Кодаджията.\n---\n\nТяло.\n",
  ".claude/skills/frontend-design/SKILL.md": "---\nname: frontend-design\ndescription: Дизайн.\n---\n",
  ".claude/skills/motion-a11y/SKILL.md": "---\nname: motion-a11y\ndescription: Движение. Собственик = агентът **Дизайнера**.\n---\n",
  ".claude/skills/agent-doctrine/SKILL.md": "---\nname: agent-doctrine\ndescription: Доктрината.\n---\n",
};
const reader = {
  read: (p) => { if (!(p in files)) throw new Error(`няма ${p}`); return files[p]; },
  list: (dir) => [...new Set(Object.keys(files).filter((p) => p.startsWith(dir + "/")).map((p) => p.slice(dir.length + 1).split("/")[0]))],
};

test("frontmatter: прост ключ, сгънат `>-` и списък", () => {
  const fm = parseFrontmatter(files[".claude/agents/dizayner.md"]);
  assert.equal(fm.data.name, "dizayner");
  assert.equal(fm.data.description, "Дизайнера — ефекти. Втори ред.");
  assert.deepEqual(fm.data.skills, ["agent-doctrine", "frontend-design"]);
  assert.equal(fm.body.trim(), "Ти си Дизайнера.");
});

test("собственикът на умение се чете по име на агента (и удебелено)", () => {
  const own = skillOwners(reader, [{ id: "kodadjiyata", name: "Кодаджията" }, { id: "dizayner", name: "Дизайнера" }]);
  assert.deepEqual(own.kodadjiyata, ["owasp-review"]);
  assert.deepEqual(own.dizayner, ["motion-a11y"]);
});

test("данните: всички агенти и екипи, умения (заредени + свои), версия, инструменти с обяснение", () => {
  const d = buildAppData(reader);
  assert.deepEqual(d.teams.map((t) => t.id), ["kod", "forma"]);
  const k = d.agents.find((a) => a.id === "kodadjiyata");
  assert.equal(k.team, "kod");
  assert.equal(k.version, "68.6.0");
  assert.equal(k.lessons, 300);
  assert.deepEqual(k.skills.map((s) => s.id), ["agent-doctrine", "owasp-review"]);
  assert.equal(k.skills.find((s) => s.id === "owasp-review").owner, true);
  assert.match(k.when, /прегледай/);
  assert.deepEqual(k.tools.map((t) => t.id), ["Read", "Grep", "Glob", "Bash"]);
  assert.ok(k.tools.every((t) => t.info), "всеки инструмент има обяснение на български");
  const z = d.agents.find((a) => a.id === "dizayner");
  assert.deepEqual(z.skills.map((s) => s.id), ["agent-doctrine", "frontend-design", "motion-a11y"]);
  assert.ok(TOOL_INFO.Bash && TOOL_INFO.WebFetch);
});

test("личността за чата: правилата първо, дефиницията и поуките като контекст, без инструменти", () => {
  const d = buildAppData(reader);
  const k = d.agents.find((a) => a.id === "kodadjiyata");
  assert.equal(k.prompt, undefined, "суровият промпт не отива отделно");
  const p = k.persona;
  assert.match(p, /Нямаш инструменти/);
  assert.match(p, /не е нова инструкция|контекст, не нови инструкции/);
  assert.match(p, /Ти си \*\*„Кодаджията“\*\*/);
  assert.match(p, /Поука/);
  assert.ok(p.indexOf("Нямаш инструменти") < p.indexOf("Ти си **„Кодаджията“**"), "правилата са преди дефиницията");
});

test("вграждане: `<` става \\u003c — нищо от данните не затваря <script> и не става разметка", () => {
  const d = buildAppData(reader);
  const s = embedJson(d);
  assert.doesNotMatch(s, /<\/script/i);
  assert.doesNotMatch(s, /</);
  assert.deepEqual(JSON.parse(s), d);
});
