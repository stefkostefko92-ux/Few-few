// Класовете (SPEC §1.2, критерий 4): детерминистично, BG/EN/IT; приоритет dsar > legal > complaint >
// payment > technical > question; spam по оценката на Brevo (rspamd) ≥ 5.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, RISKY, NO_AI } from '../src/tickets/classify.js';

const c = (text: string, subject = '', spamScore: number | null = 0) =>
  classify({ subject, text, spamScore });

test('примери по класове — български, английски, италиански', () => {
  const cases: [string, string][] = [
    ['Моля, изтрийте личните ми данни.', 'dsar'],
    ['I want to exercise my right to erasure, delete my data.', 'dsar'],
    ['Chiedo la cancellazione dei miei dati personali.', 'dsar'],
    ['Ще се обърна към адвокат и ще ви съдя.', 'legal'],
    ['Our lawyer will contact you about legal action.', 'legal'],
    ['Il mio avvocato vi invierà una diffida.', 'legal'],
    ['Подавам жалба — обслужването е ужасно.', 'complaint'],
    ['This is unacceptable, I want to file a complaint.', 'complaint'],
    ['Faccio un reclamo formale.', 'complaint'],
    ['Таксувахте ме два пъти, искам да ми върнете парите.', 'payment'],
    ['Please refund the duplicate charge on my invoice.', 'payment'],
    ['Vorrei un rimborso per la fattura di ottobre.', 'payment'],
    ['Сайтът не работи, дава грешка 500.', 'technical'],
    ["I can't log in, the page shows an error.", 'technical'],
    ["L'app non funziona dopo l'aggiornamento.", 'technical'],
    ['Колко струва годишният план?', 'question'],
    ['Do you have an Italian version?', 'question'],
  ];
  for (const [text, cls] of cases) assert.equal(c(text), cls, text);
});

test('приоритет: DSAR с плащане е DSAR; жалба с плащане е жалба; темата се брои', () => {
  assert.equal(c('Искам възстановяване на парите и да изтриете личните ми данни.'), 'dsar');
  assert.equal(c('Жалба: таксувахте ме два пъти.'), 'complaint');
  assert.equal(c('Здравейте', 'Фактура за ноември — грешна сума'), 'payment');
});

test('спам по оценка; без оценка — по съдържанието', () => {
  assert.equal(c('Колко струва?', '', 5), 'spam');
  assert.equal(c('Колко струва?', '', 4.9), 'question');
  assert.equal(c('Колко струва?', '', null), 'question');
});

test('рисковите искат второ потвърждение; dsar, legal и spam са без AI', () => {
  assert.deepEqual([...RISKY].sort(), ['complaint', 'dsar', 'legal', 'payment']);
  assert.deepEqual([...NO_AI].sort(), ['dsar', 'legal', 'spam']);
});
