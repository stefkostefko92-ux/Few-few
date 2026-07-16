// Déjà — content script: извлича четимия текст от страницата и го праща
// на service worker-а за локално индексиране. Нищо не напуска браузъра.

const MIN_TEXT = 400; // под този праг страницата не носи смисъл за търсене
const MAX_TEXT = 200_000; // таван — защита от чудовищни страници
const SETTLE_MS = 3000; // изчакваме SPA-тата да се укротят след document_idle

// Шум, който не е съдържание — маха се дори когато е ВЪТРЕ в article
const NOISE_SELECTOR = [
  'script',
  'style',
  'noscript',
  'svg',
  'canvas',
  'iframe',
  'form',
  'button',
  'nav',
  'header',
  'footer',
  'aside',
  '[role="navigation"]',
  '[role="banner"]',
  '[role="contentinfo"]',
  '[role="complementary"]',
  '[aria-hidden="true"]',
  '.comments',
  '#comments',
  '.related',
  '.share',
  '.social',
  '.newsletter',
  '.cookie',
  '.advertisement',
  '.ad',
].join(',');

const BLOCK_TAGS = new Set([
  'P',
  'DIV',
  'SECTION',
  'ARTICLE',
  'MAIN',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'LI',
  'UL',
  'OL',
  'BLOCKQUOTE',
  'PRE',
  'TABLE',
  'TR',
  'FIGCAPTION',
  'DT',
  'DD',
  'BR',
]);

// Съотношение линков текст / целия текст — блок от линкове е навигация, не съдържание
function linkDensity(el) {
  const total = (el.textContent || '').length || 1;
  let linked = 0;
  for (const a of el.querySelectorAll('a')) linked += (a.textContent || '').length;
  return linked / total;
}

// Избира най-съдържателния корен: семантичните кандидати се точкуват по
// дължина на текста, наказани за линкова гъстота (Readability-олекотено).
function pickRoot() {
  const candidates = document.querySelectorAll(
    'article, main, [role="main"], #content, .content, .post, .article-body, .entry-content',
  );
  let best = null;
  let bestScore = 0;
  for (const el of candidates) {
    const len = (el.textContent || '').length;
    if (len < MIN_TEXT) continue;
    const score = len * (1 - Math.min(linkDensity(el), 0.9));
    if (score > bestScore) {
      bestScore = score;
      best = el;
    }
  }
  return best || document.body;
}

// Клонираме, чистим шума и сглобяваме текста по блокове (нови редове между
// блоковите елементи — иначе заглавия и абзаци се слепват).
function extract() {
  const root = pickRoot();
  if (!root) return '';
  const clone = root.cloneNode(true);
  clone.querySelectorAll(NOISE_SELECTOR).forEach((el) => el.remove());

  const parts = [];
  let current = '';
  const walk = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      current += node.nodeValue;
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const isBlock = BLOCK_TAGS.has(node.tagName);
    if (isBlock && current.trim()) {
      parts.push(current);
      current = '';
    }
    for (const child of node.childNodes) walk(child);
    if (isBlock && current.trim()) {
      parts.push(current);
      current = '';
    }
  };
  walk(clone);
  if (current.trim()) parts.push(current);

  const text = parts
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
  return text.slice(0, MAX_TEXT);
}

async function run() {
  if (window !== window.top) return; // iframe-ите не ни интересуват
  const text = extract();
  if (text.length < MIN_TEXT) return;
  try {
    await chrome.runtime.sendMessage({
      type: 'deja:page',
      url: location.href,
      title: document.title || location.hostname,
      lang: document.documentElement.lang || '',
      text,
    });
  } catch {
    // service worker-ът може да се рестартира точно сега — прескачаме,
    // страницата ще бъде хваната при следващо посещение
  }
}

setTimeout(run, SETTLE_MS);

// SPA навигации: history API-то живее в света на страницата и не можем да го
// прихванем от изолирания свят, затова следим location.href на интервал.
// Дубликатите не тежат — background-ът ги реже по хеш на съдържанието.
if (window === window.top) {
  let lastHref = location.href;
  let pending = null;
  setInterval(() => {
    if (location.href === lastHref) return;
    lastHref = location.href;
    clearTimeout(pending);
    pending = setTimeout(run, SETTLE_MS); // даваме на SPA-то време да рендерира
  }, 2000);
}
