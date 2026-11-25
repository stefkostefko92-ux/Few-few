import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import vm from 'node:vm';
import { ROOT } from './helpers.js';

/**
 * Истинският public/widget.js във vm с минимален фалшив DOM и фалшив fetch (без мрежа).
 * Проверяваме поведението, което виждат посетителят и шлюзът: какво се праща като история.
 */

type Listener = (ev: { preventDefault(): void; key?: string; shiftKey?: boolean }) => void;

class FakeEl {
  attrs = new Map<string, string>();
  children: FakeEl[] = [];
  listeners = new Map<string, Listener[]>();
  parent: FakeEl | null = null;
  textContent = '';
  className = '';
  hidden = false;
  disabled = false;
  value = '';
  placeholder = '';
  scrollTop = 0;
  scrollHeight = 0;
  href = '';
  target = '';
  rel = '';
  setAttribute(k: string, v: unknown) {
    this.attrs.set(k, String(v));
  }
  getAttribute(k: string) {
    return this.attrs.get(k) ?? null;
  }
  addEventListener(type: string, fn: Listener) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  dispatch(type: string) {
    for (const fn of this.listeners.get(type) ?? []) fn({ preventDefault() {} });
  }
  appendChild(c: FakeEl) {
    c.parent = this;
    this.children.push(c);
    return c;
  }
  remove() {
    if (!this.parent) return;
    this.parent.children = this.parent.children.filter((c) => c !== this);
    this.parent = null;
  }
  focus() {}
  requestSubmit() {
    this.dispatch('submit');
  }
  attachShadow() {
    return new FakeRoot();
  }
}

class FakeRoot {
  readonly els: Record<string, FakeEl> = {};
  html = '';
  set innerHTML(html: string) {
    this.html = html;
    for (const sel of ['.fab', '.panel', '.log', 'form', 'textarea', '.btn', '.x', '.ttl']) {
      this.els[sel] = new FakeEl();
    }
    for (const sel of ['.ai', '.pv', '.note']) this.els[sel] = new FakeEl();
  }
  querySelector(sel: string) {
    return this.els[sel] ?? null;
  }
}

interface Sent {
  agent: string;
  messages: Array<{ role: string; content: string }>;
}

function sse(events: Array<[string, unknown]>): Uint8Array {
  return new TextEncoder().encode(
    events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join(''),
  );
}

function loadWidget(replies: Uint8Array[], lang = 'bg') {
  const sent: Sent[] = [];
  let shadow: FakeRoot | null = null;
  const body = new FakeEl();
  const script = new FakeEl();
  script.setAttribute('data-key', 'cs_pk_' + 'x'.repeat(43));
  script.setAttribute('data-agent', 'seo');
  script.setAttribute('data-lang', lang);
  (script as unknown as { src: string }).src = 'https://gw.example/widget.js';
  const document = {
    currentScript: script,
    body,
    documentElement: { lang: 'bg' },
    createElement() {
      const el = new FakeEl();
      el.attachShadow = () => (shadow = new FakeRoot()) as never;
      return el;
    },
    addEventListener() {},
  };
  const fetch = async (_url: string, init: { body: string }) => {
    sent.push(JSON.parse(init.body) as Sent);
    const chunk = replies.shift();
    assert.ok(chunk, 'няма подготвен отговор');
    let done = false;
    return {
      ok: true,
      status: 200,
      body: {
        getReader: () => ({
          read: async () =>
            done
              ? { done: true, value: undefined }
              : ((done = true), { done: false, value: chunk }),
        }),
      },
    };
  };
  const code = readFileSync(join(ROOT, 'public', 'widget.js'), 'utf8');
  vm.runInNewContext(code, { document, fetch, URL, TextDecoder, console });
  assert.ok(shadow, 'уиджетът не се монтира');
  const root = shadow as FakeRoot;
  const input = root.els['textarea']!;
  const form = root.els['form']!;
  const sendBtn = root.els['.btn']!;
  const log = root.els['.log']!;

  async function ask(text: string): Promise<void> {
    input.value = text;
    form.dispatch('submit');
    assert.equal(sendBtn.disabled, true);
    for (let i = 0; i < 200 && sendBtn.disabled; i++) {
      await new Promise((r) => setImmediate(r));
    }
    assert.equal(sendBtn.disabled, false, 'заявката не приключи');
  }
  return { sent, ask, log, root };
}

describe('уиджет — достъпност на AI бележката (AI Act чл. 50(5))', () => {
  test('полето за въпрос сочи бележката с aria-describedby → четецът я прочита при фокус', () => {
    const { html } = loadWidget([]).root;
    const noteId = /<p class="note"[^>]*\bid="([^"]+)"/.exec(html)?.[1];
    assert.ok(noteId, 'бележката .note няма id');
    const described = /<textarea[^>]*\baria-describedby="([^"]+)"/.exec(html)?.[1];
    assert.equal(described, noteId, 'textarea не е описано от бележката');
    assert.equal(html.split(`id="${noteId}"`).length - 1, 1, 'id-то не е уникално');
  });
});

describe('уиджет — история на разговора', () => {
  test('нормален ход: отговорът остава в историята', async () => {
    const w = loadWidget([
      sse([
        ['delta', { text: 'Отговор' }],
        ['done', { stop: 'end_turn', truncated: false }],
      ]),
      sse([['done', { stop: 'end_turn', truncated: false }]]),
    ]);
    await w.ask('Първи');
    await w.ask('Втори');
    assert.deepEqual(w.sent[1]!.messages, [
      { role: 'user', content: 'Първи' },
      { role: 'assistant', content: 'Отговор' },
      { role: 'user', content: 'Втори' },
    ]);
  });

  test('отказ (refusal): отказаният ход и частичният отговор НЕ остават в историята', async () => {
    const w = loadWidget([
      sse([
        ['delta', { text: 'Частичен текст' }],
        ['refusal', { message: 'x' }],
        ['done', { stop: 'refusal', truncated: false }],
      ]),
      sse([['done', { stop: 'end_turn', truncated: false }]]),
    ]);
    await w.ask('Отказан въпрос');
    const bubbles = w.log.children.map((c) => c.textContent);
    assert.ok(
      bubbles.some((t) => /не може да помогне/.test(t)),
      'липсва ясно съобщение за отказ',
    );
    assert.equal(
      bubbles.some((t) => t.includes('Частичен текст')),
      false,
      'частичният отказан отговор остава на екрана',
    );
    await w.ask('Нов въпрос');
    assert.deepEqual(w.sent[1]!.messages, [{ role: 'user', content: 'Нов въпрос' }]);
  });

  test('текстът при отказ не обещава махане от екрана — въпросът остава видим (BG/EN/IT)', async () => {
    const expected: Record<string, string> = {
      bg: 'Асистентът не може да помогне с тази заявка. Няма да я взема предвид в следващите отговори — можеш да зададеш друг въпрос.',
      en: 'The assistant can’t help with this request. It won’t be taken into account in later answers — you can ask something else.',
      it: "L'assistente non può aiutarti con questa richiesta. Non ne terrà conto nelle risposte successive: puoi fare un'altra domanda.",
    };
    for (const [lang, text] of Object.entries(expected)) {
      const w = loadWidget(
        [
          sse([
            ['refusal', { message: 'x' }],
            ['done', { stop: 'refusal', truncated: false }],
          ]),
        ],
        lang,
      );
      await w.ask('Отказан въпрос');
      const bubbles = w.log.children.map((c) => c.textContent);
      assert.ok(bubbles.includes('Отказан въпрос'), `${lang}: въпросът изчезна от екрана`);
      assert.ok(bubbles.includes(text), `${lang}: ${JSON.stringify(bubbles)}`);
      assert.equal(/removed|rimossa|не остава/i.test(bubbles.join(' ')), false, lang);
    }
  });
});
