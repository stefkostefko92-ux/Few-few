// Честна молба за отзив. Правила (Chrome Web Store забранява манипулиране на
// оценките): питаме ВСИЧКИ еднакво, без награда, без да пресяваме само доволните,
// и винаги до „Оцени“ стои „Нещо не работи?“ — проблемите стигат до нас, а не
// се губят. Моментът е след реална полза: третото успешно намиране (търсене →
// отворен спомен). „Не сега“ → питаме още веднъж след 30 дни; оценка или
// обратна връзка → никога повече. Броят живее локално, никъде не се праща.

const KEY = 'rateAsk';
const FIRST_AT = 3; // успешни намирания преди първата молба
const AGAIN_AFTER_WINS = 10; // … и още толкова преди втората (след „Не сега“)
const AGAIN_AFTER_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_ASKS = 2;
const SUPPORT_EMAIL = 'info@carbonstealth.eu';

async function read() {
  const { [KEY]: state = { wins: 0, asks: 0, decided: null, laterAt: 0, laterWins: 0 } } =
    await chrome.storage.local.get(KEY);
  return state;
}

const write = (state) => chrome.storage.local.set({ [KEY]: state });

// търсене → клик на спомен: паметта свърши работа
export async function recordWin() {
  const state = await read();
  state.wins += 1;
  await write(state);
}

export function shouldAsk(state, now = Date.now()) {
  if (state.decided || state.asks >= MAX_ASKS) return false;
  if (state.asks === 0) return state.wins >= FIRST_AT;
  return now - state.laterAt >= AGAIN_AFTER_MS && state.wins - state.laterWins >= AGAIN_AFTER_WINS;
}

async function decide(choice) {
  const state = await read();
  state.asks += 1;
  if (choice === 'later') {
    state.laterAt = Date.now();
    state.laterWins = state.wins;
  } else {
    state.decided = choice;
  }
  await write(state);
}

const isFirefox = () => typeof browser !== 'undefined' && /firefox/i.test(navigator.userAgent);

export function reviewUrl() {
  return isFirefox()
    ? `https://addons.mozilla.org/firefox/addon/${encodeURIComponent(chrome.runtime.id)}/reviews/`
    : `https://chromewebstore.google.com/detail/${chrome.runtime.id}/reviews`;
}

// обратната връзка не носи нищо от паметта — само версия и браузър
export function feedbackUrl(t) {
  const version = chrome.runtime.getManifest().version;
  const subject = `Déjà ${version} — ${t('rateFeedbackSubject')}`;
  const body = `\n\n—\nDéjà ${version} · ${navigator.userAgent}`;
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// Слага картата в host, когато е моментът (и при всяко ново намиране в
// същата сесия). deps: { el, icon, t }; canShow() — друга покана има предимство.
export function mountRateNudge(host, { el, icon, t, canShow = () => true }) {
  let shown = false;

  async function maybeShow() {
    if (shown || !canShow()) return;
    const state = await read();
    if (!shouldAsk(state) || !canShow()) return;
    shown = true;

    const card = el('aside', 'nudge lg');
    card.setAttribute('aria-labelledby', 'nudge-title');
    const mark = el('div', 'nudge-mark');
    mark.append(icon('star'));
    const body = el('div', 'nudge-body');
    const title = el('h2', 'nudge-title', t('rateTitle', [String(state.wins)]));
    title.id = 'nudge-title';
    const text = el('p', 'nudge-text', t('rateText'));
    const actions = el('div', 'nudge-actions');

    const rate = el('a', 'lg-accent nudge-rate');
    rate.append(icon('star'), document.createTextNode(t('rateButton')));
    rate.href = reviewUrl();
    rate.target = '_blank';
    rate.rel = 'noopener';
    const feedback = el('a', 'secondary nudge-feedback');
    feedback.append(icon('chat'), document.createTextNode(t('rateFeedback')));
    feedback.href = feedbackUrl(t);
    const later = el('button', 'nudge-later', t('rateLater'));
    later.type = 'button';
    const close = el('button', 'nudge-close');
    close.type = 'button';
    close.setAttribute('aria-label', t('rateLater'));
    close.append(icon('close'));

    const done = async (choice, message) => {
      await decide(choice);
      body.replaceChildren(el('p', 'nudge-thanks', message));
      close.remove();
      setTimeout(() => card.remove(), 4000);
    };
    rate.addEventListener('click', () => done('rated', t('rateThanks')));
    feedback.addEventListener('click', () => done('feedback', t('rateFeedbackThanks')));
    const dismiss = async () => {
      await decide('later');
      card.remove();
    };
    later.addEventListener('click', dismiss);
    close.addEventListener('click', dismiss);

    actions.append(rate, feedback, later);
    body.append(title, text, actions);
    card.append(mark, body, close);
    host.prepend(card);
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[KEY]) maybeShow();
  });
  maybeShow();
}
