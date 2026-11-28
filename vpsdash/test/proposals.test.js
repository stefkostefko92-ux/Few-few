// Предложения от агентите: каталогът, проверката на входа и опашката.
// Сървърната страна (кой стига до кои маршрути) е в attack.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateProposal, validateAction, ProposalStore, executeAction, LIMITS, PROPOSAL_ACTIONS } from '../src/proposals.js';

const good = () => ({
  agent: 'VPS-аджията',
  title: 'Рестарт на medqr — паметта расте без край',
  why: 'RSS на medqr расте линейно 6 ч.\nСлед рестарт се връща на 120 MB.',
  evidence: 'overview: mem 91%; services: medqr active 6h',
  review: 'Claude: проверено — единично действие, обратимо, без данни.',
  rollback: 'Рестартът е обратим сам по себе си.',
  action: { type: 'service.restart', params: { unit: 'medqr.service' } },
});

test('предложения: валидно минава и се нормализира', () => {
  const v = validateProposal(good());
  assert.equal(v.action.type, 'service.restart');
  assert.equal(v.action.params.unit, 'medqr.service');
  assert.ok(v.why.includes('\n'), 'новият ред в дългите полета се пази');
});

test('предложения: прегледът на Claude е задължителен', () => {
  const b = good();
  delete b.review;
  assert.throws(() => validateProposal(b), /review/);
});

test('предложения: само действия от каталога', () => {
  for (const type of ['shell.run', 'terminal', 'files.write', 'env.set', 'power.reboot', '__proto__']) {
    assert.throws(() => validateAction({ type, params: {} }), /Непознато действие/, type);
  }
});

test('предложения: параметрите минават през затворени правила', () => {
  // Инжекция през името на unit/контейнер/стек — нищо не бива да стигне до команда.
  const lethal = ['medqr; rm -rf /', '$(curl evil)', 'a b', '../etc', '-rf', ''];
  for (const unit of lethal) {
    assert.throws(() => validateAction({ type: 'service.restart', params: { unit } }), /Невалиден параметър/, unit);
  }
  assert.throws(() => validateAction({ type: 'docker.restart', params: { id: '-H tcp://x' } }), /Невалиден/);
  assert.throws(() => validateAction({ type: 'compose.restart', params: { project: 'Ab;c' } }), /Невалиден/);
  // Непознат параметър = отказ, не мълчаливо игнориране.
  assert.throws(() => validateAction({ type: 'service.restart', params: { unit: 'a.service', force: true } }), /Непознат параметър/);
  // Списък продукти: само имена.
  assert.throws(() => validateAction({ type: 'deploy.rollback', params: { release: '20261011-101124', projects: ['ok', 'x y'] } }), /списък/);
  assert.deepEqual(
    validateAction({ type: 'deploy.rollback', params: { release: '20261011-101124', projects: ['medqr', 'medqr'] } }).params.projects,
    ['medqr']
  );
});

test('предложения: непознато поле и прекалено дълъг текст се отказват', () => {
  assert.throws(() => validateProposal({ ...good(), run: 'curl x | sh' }), /Непознато поле/);
  assert.throws(() => validateProposal({ ...good(), title: 'x'.repeat(LIMITS.title + 1) }), /над/);
  assert.throws(() => validateProposal({ ...good(), agent: 'агент<script>' }), /непозволени/);
});

test('предложения: контролните знаци не стигат до панела', () => {
  const v = validateProposal({ ...good(), title: 'ред\u001b[31mчервено\u0007', why: 'а\rб\u0000в' });
  assert.ok(!/[\u0000-\u001f]/.test(v.title));
  assert.equal(v.why, 'а\nбв');
});

test('опашка: таван на чакащите, изтичане, запис с права 600', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csd-prop-'));
  try {
    const st = new ProposalStore(dir);
    const t0 = Date.now();
    for (let i = 0; i < LIMITS.pending; i++) st.add(validateProposal(good()), t0);
    assert.throws(() => st.add(validateProposal(good()), t0), (e) => e.status === 429);
    // Изтичане: след 24 ч чакащите стават „expired" и мястото се освобождава.
    st.expire(t0 + LIMITS.ttlMs + 1);
    assert.equal(st.items.filter((p) => p.status === 'pending').length, 0);
    st.add(validateProposal(good()), t0 + LIMITS.ttlMs + 2);
    const mode = fs.statSync(path.join(dir, 'proposals.json')).mode & 0o777;
    assert.equal(mode, 0o600);
    // Повреден файл → празна опашка, не срив.
    fs.writeFileSync(path.join(dir, 'proposals.json'), '{не е json');
    assert.equal(new ProposalStore(dir).items.length, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('изпълнение: минава през функциите на панела и проверява входа НАНОВО', async () => {
  const calls = [];
  const deps = {
    cfg: {}, audit: { log() {} }, user: 'admin',
    jobs: { start: (spec) => ({ id: 'job1', spec }) },
    services: { serviceAction: async (unit, action) => { calls.push(['svc', unit, action]); return { unit, state: 'active' }; } },
    docker: { dockerAction: async () => ({}) },
    compose: { composeList: async () => ({ projects: [{ name: 'stack', configFiles: '/opt/stack/compose.yml' }] }), composeActionSpec: (b) => ({ b }) },
    reclaim: { reclaimable: async () => ({ items: [] }) },
    apthealth: {}, system: {}, deploy: {},
  };
  const out = await executeAction({ type: 'service.restart', params: { unit: 'medqr.service' } }, deps);
  assert.deepEqual(calls[0], ['svc', 'medqr.service', 'restart']);
  assert.equal(out.result.state, 'active');
  // Стек, който го няма на машината, не се рестартира „по име от агента".
  await assert.rejects(executeAction({ type: 'compose.restart', params: { project: 'other' } }, deps), /Няма такъв Compose/);
  const c = await executeAction({ type: 'compose.restart', params: { project: 'stack' } }, deps);
  assert.equal(c.job.spec.b.configFile, '/opt/stack/compose.yml', 'файлът идва от сървъра, не от агента');
  // Подменено на диска действие пак минава през проверката.
  await assert.rejects(executeAction({ type: 'service.restart', params: { unit: 'x; reboot' } }, deps), /Невалиден/);
  // Категория, която сървърът не вижда, не се трие.
  await assert.rejects(executeAction({ type: 'reclaim.run', params: { category: 'apt-cache' } }, deps), /Няма такава категория/);
});

test('каталог: всяко действие има заглавие и клас от одита', () => {
  for (const [type, a] of Object.entries(PROPOSAL_ACTIONS)) {
    assert.ok(a.title, type);
    assert.match(a.cls, /^[ABC]$/, type);
  }
});

// ── Деплой от GitHub (fetch-deploy.sh) — бутонът и предложението ──────────────
import { fetchDeploySpec, assertRef } from '../src/deploy.js';
test('деплой от GitHub: ref по правилото на fetch-deploy.sh, без PR от чужд форк', () => {
  for (const ok of ['main', 'v1.17.3', 'claude/vps-dashboard-full-s7ftx3', 'a'.repeat(40)]) assert.equal(assertRef(ok), ok);
  assert.equal(assertRef(''), 'main', 'празно = main');
  for (const bad of ['pull/5/head', 'refs/pull/5/head', '../etc', 'a..b', '-rf', '/abs', 'main;reboot', 'клон']) {
    assert.throws(() => assertRef(bad), /ref|Ref/, bad);
  }
});

test('деплой от GitHub: проекти само от списъка, смяна на ref само изрично', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csd-fetchdeploy-'));
  fs.mkdirSync(path.join(dir, 'cur', 'deploy'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'cur', 'deploy', 'fetch-deploy.sh'), '#!/bin/bash\n');
  const cfg = { paths: { currentLink: path.join(dir, 'cur') } };
  try {
    const s = fetchDeploySpec(cfg, { ref: 'main', projects: ['vpsdashboard', 'medqr', 'vpsdashboard'] });
    assert.equal(s.cmd, 'bash');
    assert.deepEqual(s.args, [path.join(dir, 'cur', 'deploy', 'fetch-deploy.sh')]);
    assert.equal(s.env.REF, 'main');
    assert.equal(s.env.PROJECTS, 'vpsdashboard medqr');
    assert.equal(s.env.CSD_SELF_DEPLOY, '1', 'панелът отлага собствения си рестарт');
    assert.equal(s.env.ALLOW_REF_SWITCH, undefined);
    assert.equal(fetchDeploySpec(cfg, { allowRefSwitch: 'true' }).env.ALLOW_REF_SWITCH, undefined, 'само булево true');
    assert.equal(fetchDeploySpec(cfg, { allowRefSwitch: true }).env.ALLOW_REF_SWITCH, '1');
    assert.throws(() => fetchDeploySpec(cfg, { projects: ['няма-такъв'] }), /Непознат проект/);
    assert.throws(() => fetchDeploySpec({ paths: { currentLink: path.join(dir, 'няма') } }, {}), /fetch-deploy\.sh/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('предложение „деплой": агентът предлага само main или таг — клон/SHA/PR е отказ', () => {
  const base = { agent: 'VPS-аджията', title: 'Нова версия', why: 'Поправка на X', review: 'Прегледано от Claude' };
  const ok = validateProposal({ ...base, action: { type: 'deploy.fetch', params: { ref: 'main', projects: ['vpsdash'] } } });
  assert.deepEqual(ok.action, { type: 'deploy.fetch', params: { ref: 'main', projects: ['vpsdash'] } });
  validateProposal({ ...base, action: { type: 'deploy.fetch', params: { ref: 'v1.17.3' } } });
  for (const ref of ['claude/x', 'a'.repeat(40), 'pull/1/head', 'main ', 'mainx']) {
    assert.throws(() => validateProposal({ ...base, action: { type: 'deploy.fetch', params: { ref } } }), /Невалиден параметър/, ref);
  }
  assert.throws(() => validateProposal({ ...base, action: { type: 'deploy.fetch', params: { ref: 'main', allowRefSwitch: true } } }), /Непознат параметър/, 'смяната на ref е само на човека');
});
