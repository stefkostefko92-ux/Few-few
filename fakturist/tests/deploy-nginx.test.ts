import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

/**
 * Таванът на входа по адрес (express-rate-limit) брои по `req.ip`, а то идва от X-Forwarded-For зад nginx
 * (`trust proxy` = loopback). Ако nginx пропусне клиентския хедър, всеки подправен XFF е нов брояч
 * (Разбивача, 16.11.2026). Затова конфигурацията презаписва хедъра с реалния адрес на всяко proxy_pass, а
 * пътищата за вход имат и свой таван по реалния сокет.
 */
const conf = readFileSync(new URL('../deploy/nginx/fakturist.conf', import.meta.url), 'utf8');

test('nginx презаписва X-Forwarded-For с реалния адрес на всяко proxy_pass', () => {
  const blocks = conf.split(/\blocation\b/).slice(1);
  const proxied = blocks.filter((block) => /proxy_pass\s+http:\/\/127\.0\.0\.1:/.test(block));
  assert.ok(proxied.length >= 2, 'вход и всичко останало');
  for (const block of proxied) {
    assert.match(block, /proxy_set_header\s+X-Forwarded-For\s+\$remote_addr;/);
    assert.doesNotMatch(block, /\$proxy_add_x_forwarded_for/, 'добавянето пази подправения хедър');
  }
});

test('пътищата за вход имат таван по реалния сокет в nginx', () => {
  assert.match(conf, /limit_req_zone\s+\S+\s+zone=fakturist_auth:/);
  assert.match(
    conf,
    /location ~ \^\/\(vhod\|[^)]*pokana[^)]*\)[\s\S]*?limit_req zone=fakturist_auth/,
  );
});
