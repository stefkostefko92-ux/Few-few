// Липсващите данни (FR-07) като видове полета: кодът от сървъра (`ctx.*`, `collect.*`, свободен
// текст на модела) → какво попълва техникът. Редът на видовете е редът на диагностичната стойност,
// който сървърът вече е приложил (src/safety/missing-order.ts): QR/сериен номер → FW → HW/опция → код →
// снимка → лог → извършени проверки → кратки отговори. Обясненията (`gate.*`, `kb.*`) не са поле.

const KINDS = [
  ['serial', /^(ctx|collect)\.serial$/],
  ['firmware', /^(ctx|collect)\.firmware$/],
  ['hardwareRevision', /^(ctx|collect)\.hardwareRevision$/],
  // FR-01: опция на таблото, която иска приложим документ (напр. „ctx.option:inverter“).
  ['option', /^ctx\.option:.+$/],
  ['errorCode', /^(ctx\.(unknownIdentifier|photoCodeMismatch|photoCode):.+|collect\.errorCode)$/],
  ['photo', /^collect\.(displayPhoto|betterPhoto|photoFormat|photoSize)$/],
  ['log', /^collect\.(eventLog|logExcerpt)$/],
  ['checks', /^collect\.checksDone$/],
  ['note', /^(gate|kb)\./],
];

/** Видът поле за един код; свободният текст на модела е „кратък отговор“ (answer). */
export function kindOf(item) {
  for (const [kind, re] of KINDS) if (re.test(item)) return kind;
  // Непознат код (ctx./collect. без поле) — показва се като обяснение, не като въпрос.
  return /^(ctx|collect|ai)\.[\w.]+(:.*)?$/.test(item) ? 'note' : 'answer';
}

const ORDER = [
  'serial',
  'firmware',
  'hardwareRevision',
  'option',
  'errorCode',
  'photo',
  'log',
  'checks',
  'answer',
  'note',
];

/**
 * Полетата от missingData + collect: един вид → едно поле (кодовете се събират), кратките
 * отговори — по един на въпрос. Стабилен ред по вида, после по появяване.
 */
export function fieldsFor(items) {
  const byKind = new Map();
  const list = [];
  for (const item of [...new Set(items.filter((x) => typeof x === 'string' && x))]) {
    const kind = kindOf(item);
    if (kind === 'answer' || kind === 'note' || kind === 'option') {
      list.push({ kind, codes: [item] });
      continue;
    }
    const prev = byKind.get(kind);
    if (prev) prev.codes.push(item);
    else {
      const f = { kind, codes: [item] };
      byKind.set(kind, f);
      list.push(f);
    }
  }
  return list
    .map((f, i) => ({ f, i, rank: ORDER.indexOf(f.kind) }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .map((x) => x.f);
}

/** Кодът за грешка, който да предложим в полето: от снимката или текущият в контекста. */
export function suggestedCode(field, context) {
  for (const code of field.codes) {
    const m = /^ctx\.(photoCodeMismatch|photoCode):(.+)$/.exec(code);
    if (m) return m[2];
  }
  return context?.errorCode ?? '';
}

/** Ключът на опцията от кода „ctx.option:<ключ>“. */
export const optionKey = (code) => String(code).slice('ctx.option:'.length);
