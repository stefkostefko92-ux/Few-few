// Тестове за терминалния емулатор (чист JS, без DOM) и PTY помощниците.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Terminal, colorOf, keyToSequence } from '../public/ansi.js';
import { clampDim } from '../src/pty.js';

test('обикновен текст и нов ред', () => {
  const t = new Terminal(20, 5);
  t.write('здравей\r\nсвят');
  assert.equal(t.toText(), 'здравей\nсвят');
});

test('връщане на курсора презаписва реда', () => {
  const t = new Terminal(20, 5);
  t.write('първо\rвторо');
  assert.equal(t.toText(), 'второ');
});

test('backspace трие назад', () => {
  const t = new Terminal(20, 5);
  t.write('abcX\b \b');
  assert.equal(t.toText(), 'abc');
});

test('позициониране на курсора (CSI H) и изтриване на екрана (CSI 2J)', () => {
  const t = new Terminal(10, 4);
  t.write('ред1\r\nред2\r\nред3');
  t.write('\x1b[1;1H');
  t.write('X');
  assert.match(t.toText().split('\n')[0], /^Xед1/);
  t.write('\x1b[2J\x1b[1;1H');
  t.write('чисто');
  assert.equal(t.toText(), 'чисто');
});

test('изтриване до края на реда (CSI K)', () => {
  const t = new Terminal(20, 3);
  t.write('дълъг текст тук');
  t.write('\x1b[6G'); // колона 6
  t.write('\x1b[K');
  assert.equal(t.toText(), 'дълъг');
});

test('SGR цветове дават стил в HTML и се нулират', () => {
  const t = new Terminal(20, 3);
  t.write('\x1b[32mзелено\x1b[0mнормално');
  const html = t.toHtml();
  assert.match(html, /<span style="color:#33e6a0">зелено<\/span>/);
  assert.match(html, /нормално/);
  // Нулирането е свършило работа — „нормално" не е в оцветения span.
  assert.doesNotMatch(html, /зеленонормално/);
});

test('SGR 256 цвята и truecolor', () => {
  assert.equal(colorOf(1), '#ff5c6c');
  assert.equal(colorOf(-1), null);
  assert.equal(colorOf(232), 'rgb(8,8,8)');
  assert.equal(colorOf('rgb(1,2,3)'), 'rgb(1,2,3)');
  const t = new Terminal(20, 3);
  t.write('\x1b[38;2;255;0;0mчервено');
  assert.match(t.toHtml(), /color:rgb\(255,0,0\)/);
});

test('OSC заглавие се поглъща, не се печата', () => {
  const t = new Terminal(30, 3);
  t.write('\x1b]0;root@vm: /tmp\x07готово');
  assert.equal(t.toText(), 'готово');
  assert.equal(t.title, 'root@vm: /tmp');
});

test('частните режими (скоби при поставяне) не оставят боклук', () => {
  const t = new Terminal(30, 3);
  t.write('\x1b[?2004hкоманда\x1b[?2004l');
  assert.equal(t.toText(), 'команда');
});

test('алтернативен екран (htop) се възстановява при изход', () => {
  const t = new Terminal(20, 4);
  t.write('преди htop');
  t.write('\x1b[?1049h'); // влизаме в алтернативен екран
  t.write('\x1b[2J\x1b[1;1Hсъдържание на htop');
  assert.match(t.toText(), /htop/);
  assert.doesNotMatch(t.toText(), /преди/);
  t.write('\x1b[?1049l'); // излизаме
  assert.equal(t.toText(), 'преди htop');
});

test('превъртане: редовете излизат нагоре, курсорът стои на дъното', () => {
  const t = new Terminal(10, 3);
  for (let i = 1; i <= 6; i++) t.write(`ред${i}\r\n`);
  const lines = t.toText().split('\n');
  assert.equal(lines[0], 'ред1');
  assert.equal(lines[lines.length - 1], 'ред6');
  assert.ok(t.scrollTop > 0, 'екранът трябва да е превъртял');
});

test('историята е ограничена (не яде памет)', () => {
  const t = new Terminal(10, 3, { scrollback: 20 });
  for (let i = 0; i < 200; i++) t.write(`ред${i}\r\n`);
  assert.ok(t.lines.length <= 3 + 20 + 1, `буферът израсна до ${t.lines.length}`);
});

test('непълна последователност се изчаква през два записа', () => {
  const t = new Terminal(20, 3);
  t.write('преди\x1b[3');
  t.write('2mзелено');
  assert.equal(t.toText(), 'предизелено');
  assert.match(t.toHtml(), /#33e6a0/);
});

test('клавиши → последователности за PTY', () => {
  assert.equal(keyToSequence({ key: 'Enter' }), '\r');
  assert.equal(keyToSequence({ key: 'Backspace' }), '\x7f');
  assert.equal(keyToSequence({ key: 'ArrowUp' }), '\x1b[A');
  assert.equal(keyToSequence({ key: 'c', ctrlKey: true }), '\x03'); // Ctrl+C
  assert.equal(keyToSequence({ key: 'd', ctrlKey: true }), '\x04'); // Ctrl+D
  assert.equal(keyToSequence({ key: 'a' }), 'a');
  assert.equal(keyToSequence({ key: 'F5' }), null);
});

test('clampDim пази размерите в разумни граници', () => {
  assert.equal(clampDim(120, 40, 400), 120);
  assert.equal(clampDim(5, 40, 400), 40);
  assert.equal(clampDim(9999, 40, 400), 400);
  assert.equal(clampDim('абв', 40, 400), 40);
});

test('HTML екранира опасните знаци (нула XSS от изхода на терминала)', () => {
  const t = new Terminal(40, 3);
  t.write('<script>alert(1)</script>');
  const html = t.toHtml();
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});
