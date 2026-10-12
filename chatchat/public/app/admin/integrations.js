// Интеграцията с helpdesk (FR-09, §14.4) — само администраторът на клиента (integrations:manage):
// настройка на конектора (общ подписан webhook, Zendesk, Jira Service Management), „Тест на
// връзката“, входящият адрес за обратната синхронизация, какво точно излиза навън (GDPR) и
// дневникът на доставките. Всичко от сървъра влиза само като текст (h()).

import { t } from '../i18n.js';
import { call } from './core.js';
import { codeText } from './integrations-common.js';
import { integrationForm } from './integrations-form.js';
import { deliveryLog } from './integrations-log.js';
import { badge, button, failure, field, h, input, loading, sectionHead, toast } from './ui.js';

/** Образците за обратната синхронизация — технически текст, не се превежда. */
const INBOUND_SAMPLE = {
  WEBHOOK:
    'X-ChatChat-Timestamp: <unix>\nX-ChatChat-Signature: v1=<hex HMAC-SHA256(secret, "<timestamp>.<body>")>\n\n{"version":1,"ticket":{"number":"TS-2026-000123"},"action":"close"}',
  ZENDESK: '{"ticket_id":"{{ticket.id}}","external_id":"{{ticket.external_id}}","status":"solved"}',
  JSM: 'Jira webhook · jira:issue_updated · secret → X-Hub-Signature: sha256=…',
};

/** Какво излиза към helpdesk-а — огледало на services/integrations/payload.ts. */
const SENT = ['ticket', 'board', 'diagnosis', 'steps', 'sources', 'attachments', 'resolution'];

function inboundBlock(view) {
  const url = input({ type: 'text', readonly: true, value: view.inboundUrl, class: 'mono' });
  const copy = button(t('admin.copy'), async () => {
    try {
      await navigator.clipboard.writeText(view.inboundUrl);
      toast(t('admin.copied'));
    } catch {
      url.select();
      toast(t('admin.copyManual'), 'warn');
    }
  });
  return h(
    'section',
    { 'aria-labelledby': 'hd-inbound' },
    h('h2', { id: 'hd-inbound' }, t('admin.integrations.inbound.title')),
    h('p', { class: 'muted' }, t(`admin.integrations.inbound.${view.kind}`)),
    field(t('admin.integrations.inbound.url'), url),
    h('div', { class: 'btn-row' }, copy),
    h('pre', { class: 'quote mono small' }, INBOUND_SAMPLE[view.kind]),
    view.secrets?.inboundSecret
      ? null
      : h('p', { class: 'note note-warn' }, t('admin.integrations.inbound.off')),
  );
}

function testBlock(view) {
  const result = h('p', { role: 'status', class: 'muted' });
  const run = button(t('admin.integrations.test'), async () => {
    run.disabled = true;
    result.replaceChildren(t('admin.loading'));
    try {
      const { test } = await call('POST', '/admin/integrations/test');
      result.replaceChildren(
        test.ok
          ? badge('ok', t('admin.integrations.testOk'))
          : badge('stop', t('admin.integrations.testFail', { reason: codeText(test.code) })),
      );
    } catch (err) {
      result.replaceChildren(badge('stop', codeText(err?.code) || t('err.server')));
    } finally {
      run.disabled = false;
    }
  });
  return h(
    'div',
    { class: 'btn-row' },
    view ? run : h('span', { class: 'muted' }, t('admin.integrations.testFirst')),
    result,
  );
}

function sentBlock() {
  return h(
    'section',
    { 'aria-labelledby': 'hd-sent' },
    h('h2', { id: 'hd-sent' }, t('admin.integrations.sent.title')),
    h('ul', {}, ...SENT.map((k) => h('li', {}, t(`admin.integrations.sent.${k}`)))),
    h('p', { class: 'note' }, t('admin.integrations.sent.never')),
  );
}

export async function mount(view) {
  const render = async () => {
    view.replaceChildren(
      sectionHead(t('admin.integrations.title')),
      h('p', { class: 'muted lead' }, t('admin.integrations.lead')),
      loading(),
    );
    try {
      const data = await call('GET', '/admin/integrations');
      if (!data.available) {
        view.lastElementChild.replaceWith(
          h('p', { class: 'note note-warn' }, t('admin.integrations.unavailable')),
        );
        return;
      }
      const integration = data.integration;
      const counts = data.counts ?? {};
      view.lastElementChild.replaceWith(
        h(
          'div',
          {},
          h(
            'p',
            { class: 'chips' },
            badge(
              integration?.enabled ? 'ok' : 'idle',
              t(integration?.enabled ? 'admin.integrations.on' : 'admin.integrations.off'),
            ),
            badge('info', t('admin.integrations.counts.pending', { n: counts.PENDING ?? 0 })),
            badge(
              (counts.DEAD ?? 0) > 0 ? 'stop' : 'ok',
              t('admin.integrations.counts.dead', { n: counts.DEAD ?? 0 }),
            ),
          ),
          h(
            'section',
            { 'aria-labelledby': 'hd-config' },
            h('h2', { id: 'hd-config' }, t('admin.integrations.config')),
            integrationForm(integration, render),
            testBlock(integration),
          ),
          integration ? inboundBlock(integration) : null,
          sentBlock(),
          h(
            'section',
            { 'aria-labelledby': 'hd-log' },
            h('h2', { id: 'hd-log' }, t('admin.integrations.log.title')),
            deliveryLog(),
          ),
        ),
      );
    } catch (err) {
      view.lastElementChild.replaceWith(failure(err, render));
    }
  };
  await render();
  return () => undefined;
}
