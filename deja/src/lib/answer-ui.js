// Картата „Отговор от паметта ти“ над резултатите. Състояния:
//   скрита      — няма API / език / устройство, или потребителят е казал „не“
//   „Попитай“   — моделът е тук, заявката не е въпрос → бутон при поискване
//   „Включи“    — моделът още не е изтеглен → обяснение + бутон (жест за тегленето)
//   отговор     — поток от текст с цитати [n] към източниците + „Спри“
// Всяко ново търсене прекъсва предишния отговор (AbortController).

import { getSettings, patchSettings } from './settings.js';
import {
  availability,
  generate,
  isQuestion,
  parseCitations,
  pickLanguage,
  pickSources,
} from './answer.js';

const deepLink = (s) => (s.quote ? s.url + '#:~:text=' + encodeURIComponent(s.quote) : s.url);

// onCited(Set<n>) — кои източници са цитирани (за да се отбележат и картите отдолу)
export function mountAnswer(host, { el, icon, t, onCite, onCited }) {
  host.classList.add('answer', 'lg');
  host.hidden = true;
  host.setAttribute('aria-live', 'polite');
  host.setAttribute('aria-label', t('answerTitle'));
  let controller = null;

  function reset() {
    controller?.abort();
    controller = null;
    host.hidden = true;
    host.replaceChildren();
  }

  function header(titleKey, withStop) {
    const head = el('div', 'answer-head');
    const mark = el('span', 'answer-mark');
    mark.append(icon('sparkle'));
    head.append(mark, el('h2', 'answer-title', t(titleKey)));
    if (withStop) {
      const stop = el('button', 'answer-stop', t('answerStop'));
      stop.type = 'button';
      stop.addEventListener('click', () => {
        controller?.abort();
        stop.remove();
      });
      head.append(stop);
    }
    return head;
  }

  function renderText(node, text, sources) {
    node.replaceChildren();
    for (const part of parseCitations(text, sources.length)) {
      if (part.text) {
        node.append(document.createTextNode(part.text));
        continue;
      }
      const src = sources[part.cite - 1];
      const cite = el('a', 'cite', String(part.cite));
      cite.href = deepLink(src);
      cite.target = '_blank';
      cite.rel = 'noopener';
      cite.title = src.title;
      cite.addEventListener('click', () => onCite?.());
      node.append(cite);
    }
  }

  async function start(query, sources, lang) {
    host.classList.remove('answer-compact');
    host.classList.add('lg');
    controller?.abort();
    controller = new AbortController();
    const { signal } = controller;
    host.hidden = false;
    const text = el('p', 'answer-text');
    const line = el('p', 'answer-status', t('answerThinking'));
    const foot = el('p', 'answer-foot', t('answerFoot', [String(sources.length)]));
    foot.hidden = true;
    host.replaceChildren(header('answerTitle', true), line, text, foot);
    let got = '';
    try {
      for await (const acc of generate({
        query,
        sources,
        lang,
        signal,
        onProgress: (loaded) =>
          (line.textContent = t('answerDownloading', [String(Math.round(loaded * 100))])),
      })) {
        if (signal.aborted) return;
        got = acc;
        line.hidden = true;
        renderText(text, acc, sources);
      }
      host.querySelector('.answer-stop')?.remove();
      if (!got.trim()) throw new Error('empty');
      foot.hidden = false;
      onCited?.(
        new Set(parseCitations(got, sources.length).flatMap((p) => (p.cite ? [p.cite] : []))),
      );
    } catch {
      if (signal.aborted && got) {
        foot.hidden = false; // спрян от човека — оставяме каквото е написано
        return;
      }
      if (signal.aborted) return;
      line.hidden = false;
      line.textContent = t('answerError');
      host.querySelector('.answer-stop')?.remove();
    }
  }

  function offerAsk(query, sources, lang) {
    host.hidden = false;
    const ask = el('button', 'secondary answer-ask');
    ask.type = 'button';
    ask.append(icon('sparkle'), document.createTextNode(t('answerAsk')));
    ask.addEventListener('click', () => start(query, sources, lang));
    host.replaceChildren(ask);
    host.classList.add('answer-compact');
    host.classList.remove('lg'); // само бутон — без стъклена кутия около него
  }

  function offerEnable(query, sources, lang) {
    host.hidden = false;
    const text = el('p', 'answer-explain', t('answerEnableText'));
    const actions = el('div', 'answer-actions');
    const go = el('button', 'lg-accent answer-enable', t('answerEnableButton'));
    go.type = 'button';
    go.addEventListener('click', () => start(query, sources, lang)); // кликът = жест за тегленето
    const no = el('button', 'answer-no', t('answerNoThanks'));
    no.type = 'button';
    no.addEventListener('click', async () => {
      await patchSettings({ answers: false });
      reset();
    });
    actions.append(go, no);
    host.replaceChildren(header('answerEnableTitle', false), text, actions);
  }

  async function run(query, results) {
    reset();
    host.classList.remove('answer-compact');
    host.classList.add('lg');
    if (!results.length) return;
    const { answers } = await getSettings();
    if (answers === false) return;
    const lang = pickLanguage(chrome.i18n.getUILanguage(), query);
    const state = await availability(lang);
    if (state === 'unsupported' || state === 'unavailable') return;
    const sources = pickSources(results);
    const question = isQuestion(query);
    if (state === 'available') {
      if (question) start(query, sources, lang);
      else offerAsk(query, sources, lang);
    } else if (question) {
      offerEnable(query, sources, lang); // downloadable / downloading
    } else {
      offerAsk(query, sources, lang);
    }
  }

  return { run, reset };
}
