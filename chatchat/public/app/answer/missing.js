// Липсващите данни като интерактивни полета в отговора (FR-07, §10.3, §12.2): номерирани стъпки в
// реда на диагностичната стойност; попълване на контекста (PATCH — със сериен номер/QR таблото се
// връзва и опциите му влизат), бутони за снимка/лог (тавата на въпроса) и кратки отговори
// (наблюдения в контекста). „Обнови и попитай отново“ праща същия въпрос с обновения контекст.
// Само за последния AI отговор в отворен случай на участник; иначе — статичен списък.

import { api } from '../api.js';
import { h } from '../dom.js';
import { errorText } from '../errors.js';
import { has, t, tCode } from '../i18n.js';
import { fieldsFor, suggestedCode } from './missing-fields.js';
import { arr, block, str } from './util.js';

let seq = 0;
const label = (code) => str(tCode(code));
const optionsText = (o) =>
  Object.entries(o ?? {})
    .map(([k, v]) => `${k}=${v}`)
    .join(', ');

/** Всички липсващи (missingData + какво да се събере преди тикета), без повторения. */
export function missingItems(p) {
  const collect = p?.escalation?.recommended ? arr(p.escalation.collect) : [];
  return [...new Set([...arr(p?.missingData), ...collect])];
}

function staticList(items) {
  return h(
    'ul',
    { class: 'plain' },
    items.map((m) => h('li', null, label(m))),
  );
}

/**
 * @param {object} p payload-ът на отговора
 * @param {{ interactive: boolean, caseId: string, context: object,
 *   onAskAgain: () => void, onContextSaved: (c: object) => void,
 *   pick: (kind: 'PHOTO'|'LOG') => void, scanQr: (cb: (device: object) => void) => void }} opts
 */
export function missingBlock(p, opts) {
  const items = missingItems(p);
  if (!items.length) return null;
  if (!opts?.interactive) return block(t('ans.missing'), 'blk-missing', staticList(items));

  const ctx = opts.context ?? {};
  const id = `mf-${(seq += 1)}`;
  const status = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const submit = h(
    'button',
    { class: 'btn btn-primary', type: 'submit', disabled: true },
    t('missing.askAgain'),
  );
  /** Какво е попълнено — четат го `refresh` и `save`. */
  const reads = [];
  let touched = false;
  let verified = null;
  const refresh = () => {
    submit.disabled = !(touched || verified || reads.some((r) => r.changed()));
  };

  const hintOf = (codes) => h('p', { class: 'hint' }, codes.map(label).join(' · '));
  const textInput = (kind, value, extra = {}) => {
    const input = h('input', {
      id: `${id}-${kind}`,
      autocomplete: 'off',
      value: value ?? '',
      ...extra,
    });
    input.addEventListener('input', refresh);
    return input;
  };

  const fields = fieldsFor(items).map((f, i) => {
    const fid = `${id}-${f.kind}-${i}`;
    switch (f.kind) {
      case 'serial': {
        const input = textInput('serial', ctx.serial, {
          class: 'mono',
          autocapitalize: 'characters',
        });
        const note = h('p', { class: 'form-note', role: 'status' });
        const found = (device) => {
          verified = device;
          input.value = device.serial ?? input.value;
          note.textContent = t('missing.serialFound', {
            model: str(device.productModel),
            hw: str(device.hardwareRevision),
            fw: str(device.firmware),
          });
          const opts2 = optionsText(device.options);
          if (opts2) note.textContent += ` · ${t('options.list', { list: opts2 })}`;
          refresh();
        };
        const verify = async () => {
          const serial = input.value.trim();
          if (!serial) return input.focus();
          try {
            found((await api('GET', `/devices/${encodeURIComponent(serial)}`)).device);
          } catch (err) {
            verified = null;
            note.textContent = err.status === 404 ? t('missing.serialNotFound') : errorText(err);
          }
        };
        input.addEventListener('input', () => {
          verified = null;
          note.textContent = '';
        });
        reads.push({
          changed: () => input.value.trim() !== '' && input.value.trim() !== (ctx.serial ?? ''),
          apply: (next) => {
            const v = input.value.trim();
            if (!v || v === (ctx.serial ?? '')) return null;
            next.serial = v;
            return v;
          },
        });
        return h(
          'li',
          { class: 'missing-item' },
          h('label', { for: input.id }, t('missing.field.serial')),
          hintOf(f.codes),
          h(
            'div',
            { class: 'inline missing-inline' },
            input,
            h(
              'button',
              { class: 'btn btn-secondary', type: 'button', onclick: verify },
              t('missing.verify'),
            ),
            h(
              'button',
              { class: 'btn btn-secondary', type: 'button', onclick: () => opts.scanQr(found) },
              t('missing.scan'),
            ),
          ),
          note,
        );
      }
      case 'firmware':
      case 'hardwareRevision':
      case 'errorCode': {
        const current = ctx[f.kind] ?? '';
        const value = f.kind === 'errorCode' ? suggestedCode(f, ctx) : current;
        const input = textInput(
          f.kind,
          value,
          f.kind === 'errorCode' ? { class: 'mono', autocapitalize: 'characters' } : {},
        );
        reads.push({
          changed: () => input.value.trim() !== current,
          apply: (next) => {
            const v = input.value.trim();
            if (v !== current) next[f.kind] = v === '' ? null : v;
            return null;
          },
        });
        return h(
          'li',
          { class: 'missing-item' },
          h('label', { for: input.id }, t(`missing.field.${f.kind}`)),
          hintOf(f.codes),
          input,
        );
      }
      case 'photo':
      case 'log': {
        const kind = f.kind === 'photo' ? 'PHOTO' : 'LOG';
        return h(
          'li',
          { class: 'missing-item' },
          h('p', { class: 'missing-label' }, t(`missing.field.${f.kind}`)),
          hintOf(f.codes),
          h(
            'button',
            {
              class: `btn ${f.kind === 'photo' ? 'btn-primary btn-photo' : 'btn-secondary'}`,
              type: 'button',
              onclick: () => {
                touched = true;
                refresh();
                opts.pick(kind);
              },
            },
            t(f.kind === 'photo' ? 'missing.takePhoto' : 'missing.attachLog'),
          ),
        );
      }
      case 'note':
        return h('li', { class: 'missing-item missing-note' }, label(f.codes[0]));
      default: {
        // Извършени проверки или кратък отговор на въпрос на модела → наблюдение в контекста.
        const question = f.kind === 'checks' ? t('missing.field.checks') : str(f.codes[0]);
        const input =
          f.kind === 'checks'
            ? h('textarea', { id: fid, rows: '2', maxlength: '450' })
            : h('input', { id: fid, autocomplete: 'off', maxlength: '400' });
        input.setAttribute('placeholder', t('missing.answerPlaceholder'));
        input.addEventListener('input', refresh);
        reads.push({
          changed: () => input.value.trim() !== '',
          apply: (next) => {
            const v = input.value.trim();
            if (v) next.observations.push(`${question}: ${v}`.slice(0, 500));
            return null;
          },
        });
        return h(
          'li',
          { class: 'missing-item' },
          h('label', { for: fid }, question),
          f.kind === 'checks' ? hintOf(f.codes) : null,
          input,
        );
      }
    }
  });

  const form = h(
    'form',
    { class: 'missing-form', novalidate: true },
    h('ol', { class: 'missing-list' }, fields),
    status,
    h('div', { class: 'missing-actions' }, submit),
    h('p', { class: 'hint' }, t('missing.askAgainHint')),
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    status.hidden = true;
    const next = { ...ctx, observations: [...arr(ctx.observations)] };
    let deviceSerial = verified?.serial ?? null;
    for (const r of reads) deviceSerial = r.apply(next) ?? deviceSerial;
    next.observations = next.observations.slice(-30);
    const contextChanged = JSON.stringify(next) !== JSON.stringify(ctx) || deviceSerial !== null;
    submit.disabled = true;
    try {
      if (contextChanged) {
        const data = await api('PATCH', `/cases/${encodeURIComponent(opts.caseId)}/context`, {
          context: next,
          ...(deviceSerial ? { deviceSerial } : {}),
        });
        opts.onContextSaved(data.case);
      }
      opts.onAskAgain();
    } catch (err) {
      status.textContent =
        err.code === 'device_not_found' && has('missing.serialNotFound')
          ? t('missing.serialNotFound')
          : errorText(err);
      status.hidden = false;
      submit.disabled = false;
    }
  });

  return h(
    'section',
    { class: 'blk blk-missing blk-missing-form', 'aria-labelledby': `${id}-t` },
    h('h3', { class: 'blk-title', id: `${id}-t` }, t('ans.missing')),
    h('p', { class: 'hint' }, t('missing.intro')),
    form,
  );
}
