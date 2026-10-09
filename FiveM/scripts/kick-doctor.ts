/**
 * Диагностика на Kick откриването. Показва на КОЯ стъпка спира.
 *
 *   docker compose exec -T cron npx tsx scripts/kick-doctor.ts
 *
 * Нищо не пише в базата — само чете и печата. Пуска се на ръка, когато
 * „Стриймъри“ не намира никого от Kick.
 *
 * ЗАЩО СЪЩЕСТВУВА. Три различни причини дават един и същ външен резултат
 * („нула стриймъри“) и не се различават от лога: отказан токен, ненамерена
 * категория, и филтър по език, който не съвпада с очаквания от Kick формат.
 * Последното е най-коварно, защото документацията на Kick НЕ казва дали
 * `language` иска `bg` или `Bulgarian` — заявката минава успешно и връща
 * празен списък, тоест изглежда като „никой не излъчва“.
 */

// Средата идва от контейнера (`env_file` в docker-compose.yml) — затова няма
// dotenv и няма нова зависимост само заради един диагностичен скрипт.
const API = 'https://api.kick.com/public/v1';
const UA = 'FiveMBulgaria/1.0 (+https://fivembulgaria.carbonstealth.eu)';

/** Кандидатите за стойност на `language`, в реда на пробване. */
const LANGUAGE_CANDIDATES = ['bg', 'Bulgarian', 'bulgarian', 'BG'];

async function token(): Promise<string | null> {
  const id = process.env.KICK_CLIENT_ID;
  const secret = process.env.KICK_CLIENT_SECRET;
  if (!id || !secret) {
    console.log('✗ 1) Ключове: ЛИПСВАТ (KICK_CLIENT_ID / KICK_CLIENT_SECRET)');
    return null;
  }
  console.log(`  1) Ключове: намерени (id ${id.slice(0, 6)}…)`);

  const res = await fetch('https://id.kick.com/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': UA },
    body: new URLSearchParams({ client_id: id, client_secret: secret, grant_type: 'client_credentials' }),
    redirect: 'error',
  });
  if (!res.ok) {
    console.log(`✗ 2) Токен: Kick отказа — HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    return null;
  }
  const body = (await res.json()) as { access_token?: string };
  console.log(`✓ 2) Токен: получен (${body.access_token ? body.access_token.length : 0} знака)`);
  return body.access_token ?? null;
}

async function get(url: string, auth: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${auth}`, accept: 'application/json', 'user-agent': UA },
  });
  const text = await res.text();
  try {
    return { status: res.status, body: JSON.parse(text) };
  } catch {
    return { status: res.status, body: text.slice(0, 300) };
  }
}

function rows(body: unknown): Record<string, unknown>[] {
  const data = (body as { data?: unknown } | null)?.data;
  return Array.isArray(data) ? (data.filter((r) => r && typeof r === 'object') as Record<string, unknown>[]) : [];
}

async function main(): Promise<void> {
  const auth = await token();
  if (!auth) return;

  // ── 3) Категорията ────────────────────────────────────────────────────────
  const pinned = Number(process.env.KICK_CATEGORY_ID);
  let category: number | null = Number.isInteger(pinned) && pinned > 0 ? pinned : null;
  if (category) {
    console.log(`  3) Категория: закована в .env → ${category}`);
  } else {
    const search = await get(`${API}/categories?q=${encodeURIComponent('grand theft auto')}`, auth);
    const found = rows(search.body);
    console.log(`  3) Категория: търсене „grand theft auto“ → HTTP ${search.status}, ${found.length} резултата`);
    for (const row of found.slice(0, 10)) console.log(`       id=${row.id}  name=${JSON.stringify(row.name)}`);
    const hit = found.find((row) => {
      const name = String(row.name ?? '').toLowerCase();
      return name === 'grand theft auto v' || name === 'gta v';
    });
    category = hit ? Number(hit.id) : null;
    console.log(
      hit
        ? `✓    точно съвпадение → id=${category}`
        : '✗    НЯМА точно съвпадение с „grand theft auto v“/„gta v“ — оттук нататък кодът спира',
    );
    if (!category) {
      console.log('     ПОПРАВКА: вземи id-то от списъка горе и го сложи в .env като KICK_CATEGORY_ID');
      return;
    }
  }

  // ── 4) Излъчвания БЕЗ филтър по език ──────────────────────────────────────
  const all = await get(`${API}/livestreams?category_id=${category}&limit=100&sort=viewer_count`, auth);
  const allRows = rows(all.body);
  console.log(`\n  4) Излъчвания в категорията БЕЗ филтър → HTTP ${all.status}, ${allRows.length} броя`);
  const langs = new Map<string, number>();
  for (const row of allRows) {
    const value = String(row.language ?? '(няма)');
    langs.set(value, (langs.get(value) ?? 0) + 1);
  }
  console.log(
    `     езици в отговора: ${[...langs.entries()].map(([k, v]) => `${JSON.stringify(k)}×${v}`).join(', ') || '—'}`,
  );

  // ── 5) Кой формат на `language` реално работи ─────────────────────────────
  console.log('\n  5) Филтър по език — кой формат връща нещо:');
  for (const value of LANGUAGE_CANDIDATES) {
    const res = await get(
      `${API}/livestreams?category_id=${category}&language=${encodeURIComponent(value)}&limit=100&sort=viewer_count`,
      auth,
    );
    const count = rows(res.body).length;
    console.log(`     language=${JSON.stringify(value).padEnd(12)} → HTTP ${res.status}, ${count} броя`);
  }

  console.log(
    '\nЧЕТЕНЕ НА РЕЗУЛТАТА:\n' +
      '  · стъпка 4 дава 0 → категорията е грешна ИЛИ в нея никой не излъчва;\n' +
      '  · стъпка 4 дава числа, а стъпка 5 навсякъде 0 → форматът на езика не е нито един от пробваните;\n' +
      '  · един от редовете в 5 дава > 0 → сложи го в .env като KICK_LANGUAGE;\n' +
      '  · навсякъде числа, но нула БЪЛГАРСКИ в стъпка 4 → в момента наистина никой български не излъчва.',
  );
}

main().catch((error) => {
  console.error('Диагностиката се провали:', error);
  process.exitCode = 1;
});
