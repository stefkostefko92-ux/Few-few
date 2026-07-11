// Déjà — страница за търсене. Праща заявката на service worker-а,
// който я embed-ва локално и подрежда парчетата по косинусова близост.

const form = document.getElementById('form');
const input = document.getElementById('query');
const button = document.getElementById('go');
const status = document.getElementById('status');
const resultsEl = document.getElementById('results');

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function render(results) {
  resultsEl.replaceChildren();
  for (const r of results) {
    const card = el('article', 'result');
    const link = el('a', null, r.title);
    link.href = r.url;
    link.target = '_blank';
    link.rel = 'noopener';
    card.append(link, el('div', 'url', r.url), el('p', 'snippet', '…' + r.snippet + '…'));
    const when = r.time ? new Date(r.time).toLocaleDateString('bg-BG') : '';
    card.append(el('div', 'meta', `близост ${r.score}${when ? ' · четено на ' + when : ''}`));
    resultsEl.append(card);
  }
}

async function refreshStats() {
  try {
    const res = await chrome.runtime.sendMessage({ type: 'deja:stats' });
    if (res?.ok) status.textContent = `В паметта: ${res.pages} страници.`;
  } catch {
    /* service worker-ът се събужда — не е фатално */
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const query = input.value.trim();
  if (!query) return;

  button.disabled = true;
  status.textContent = 'Ровя из паметта… (първото търсене зарежда модела, ~10-30 сек)';
  try {
    const res = await chrome.runtime.sendMessage({ type: 'deja:search', query });
    if (!res?.ok) throw new Error(res?.error || 'без отговор');
    if (res.results.length === 0) {
      status.textContent = 'Нищо не изплува. Или не си го чел, или Déjà още не го е запомнил.';
      resultsEl.replaceChildren();
    } else {
      status.textContent = `${res.results.length} спомена:`;
      render(res.results);
    }
  } catch (err) {
    status.textContent = 'Грешка при търсенето: ' + (err?.message || err);
  } finally {
    button.disabled = false;
  }
});

refreshStats();
