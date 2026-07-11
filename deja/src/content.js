// Déjà — content script: извлича четимия текст от страницата и го праща
// на service worker-а за локално индексиране. Нищо не напуска браузъра.

const MIN_TEXT = 400; // под този праг страницата не носи смисъл за търсене
const MAX_TEXT = 200_000; // таван — защита от чудовищни страници
const SETTLE_MS = 3000; // изчакваме SPA-тата да се укротят след document_idle

function extract() {
  // Предпочитаме семантичния корен на съдържанието; body е краен вариант.
  const root = document.querySelector('article, main, [role="main"]') || document.body;
  if (!root) return '';
  // innerText уважава layout-а: скритите елементи отпадат, блоковете дават нови редове.
  const text = (root.innerText || '')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
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
