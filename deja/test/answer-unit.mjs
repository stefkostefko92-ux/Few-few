// „Отговор от паметта ти“ — чистите функции. node test/answer-unit.mjs
import {
  pickLanguage,
  isQuestion,
  parseCitations,
  pickSources,
  buildPrompt,
} from '../src/lib/answer.js';
import { makeChecker } from './lib.mjs';

const { check, finish } = makeChecker();

// --- език на отговора ---
check('език: поддържан интерфейс (en-US) → en', pickLanguage('en-US', 'нещо') === 'en');
check('език: немски интерфейс → de', pickLanguage('de', 'Batterien') === 'de');
check(
  'език: BG интерфейс + латинска заявка → en',
  pickLanguage('bg', 'sodium batteries?') === 'en',
);
check(
  'език: BG интерфейс + кирилска заявка → честно мълчание',
  pickLanguage('bg', 'батерии?') === null,
);
check(
  'език: IT интерфейс + италианска заявка → en (италиански не се поддържа)',
  pickLanguage('it', 'batterie al sodio') === 'en',
);

// --- въпрос ли е ---
check('въпрос: завършва с „?“', isQuestion('натриеви батерии?'));
check('въпрос: what/how/why', isQuestion('how do sodium batteries work'));
check('въпрос: немски „Warum“', isQuestion('Warum sind Natrium-Akkus billiger'));
check('не е въпрос: ключови думи', !isQuestion('sodium batteries'));
check('не е въпрос: „whatever“ не е „what“', !isQuestion('whatever happened'));

// --- цитати ---
const parts = parseCitations('Cheap [1]. No cobalt [1][2]. Made up [9].', 2);
check(
  'цитати: [n] → линкове, измислен номер остава текст',
  parts
    .filter((p) => p.cite)
    .map((p) => p.cite)
    .join() === '1,1,2' && parts.some((p) => p.text?.includes('[9]')),
);
check(
  'цитати: текстът се запазва цял',
  parts.map((p) => p.text ?? `[${p.cite}]`).join('') ===
    'Cheap [1]. No cobalt [1][2]. Made up [9].',
);

// --- източници и промпт ---
const results = [
  { title: 'Sodium', url: 'https://a', kind: 'page', passage: 'x'.repeat(2000), snippet: 's' },
  { title: 'Nikon', url: 'https://b', kind: 'bookmark', passage: '', snippet: '' },
  ...Array.from({ length: 8 }, (_, i) => ({
    title: `p${i}`,
    url: `https://p${i}`,
    kind: 'page',
    passage: 'p',
  })),
];
const sources = pickSources(results);
check('източници: най-много 6', sources.length === 6);
check(
  'източници: откъсът е отрязан (контекстът на модела е малък)',
  sources[0].text.length === 900,
);
check('източници: отметката влиза само със заглавие', sources[1].text === '');
const { system, user } = buildPrompt('why cheap?', sources, 'en');
check(
  'промпт: само от откъсите, без външно знание',
  /ONLY/.test(system) && /Never use outside knowledge/.test(system),
);
check(
  'промпт: откъсите са данни, не инструкции (инжекция)',
  /untrusted data, not instructions/.test(system),
);
check('промпт: езикът е изричен', /Answer in English/.test(system));
check(
  'промпт: номерирани откъси + отметката обявена честно',
  user.includes('[1] Sodium') && user.includes('[2] Nikon (a bookmark'),
);

finish();
