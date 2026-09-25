// Съседът е НЕДОВЕРЕН вход — но не изглежда като такъв.
//
// Той е „нашата друга машина", върви същия код и носи наш токен. Точно затова е
// най-лесното място да бъде приет на доверие; а превземат ли го, той е и
// най-краткият път навътре: панелът вече го проксира и вече показва отговорите
// му на човека.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { peerStatus, nodesStatus } from '../src/nodes.js';

function fakePeer(handler) {
  const srv = http.createServer(handler);
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r({ srv, port: srv.address().port })));
}

test('съсед: един счупен НЕ сваля списъка с всички', async () => {
  // Преди: грешка при подготовката на заявката (токен с нов ред → Node хвърля
  // СИНХРОННО при задаване на хедъра) излизаше от изпълнителя на обещанието,
  // `Promise.all` отхвърляше всичко и `/api/nodes` връщаше 500. Тоест един зле
  // подаден токен скриваше и ЛОКАЛНИЯ възел, който е жив и няма нищо общо.
  const { srv, port } = await fakePeer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ nodeId: 'жив', nodeName: 'Жив' }));
  });
  const r = await nodesStatus({
    nodeId: 'аз', nodeName: 'Аз',
    peers: [
      { id: 'счупен', name: 'Счупен', url: `http://127.0.0.1:${port}`, token: 'токен\nс-нов-ред' },
      { id: 'жив', name: 'Жив', url: `http://127.0.0.1:${port}`, token: 'ok' },
    ],
  });
  srv.close();
  assert.equal(r.local.up, true, 'локалният възел се вижда независимо от съседите');
  assert.equal(r.peers.length, 2);
  assert.equal(r.peers[0].up, false);
  assert.match(r.peers[0].error, /нов ред/, 'и КАЗВА защо');
  assert.equal(r.peers[1].up, true, 'здравият съсед не пострадва от счупения');
});

test('съсед: „отказан достъп" се различава от „машината я няма"', async () => {
  // Слети в едно „недостъпен", човек часове проверява мрежа заради изтекъл токен.
  const { srv, port } = await fakePeer((req, res) => { res.writeHead(401); res.end('{}'); });
  const p = await peerStatus({ id: 'x', name: 'X', url: `http://127.0.0.1:${port}`, token: 'ok' });
  srv.close();
  assert.equal(p.up, false);
  assert.equal(p.status, 401);
  assert.match(p.error, /отказан достъп/);
});

test('съсед, който се представя за ДРУГА машина, не минава за наред', async () => {
  // Адрес, сочещ друга машина (копи-пейст, сменен DNS, преместен peer), иначе
  // минава за „наред" и панелът показва чужди числа под името на нашия възел.
  const { srv, port } = await fakePeer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ nodeId: 'съвсем-друг', nodeName: 'Друг' }));
  });
  const p = await peerStatus({ id: 'очакван', name: 'Очакван', url: `http://127.0.0.1:${port}`, token: 'ok' });
  srv.close();
  assert.equal(p.up, false);
  assert.equal(p.identityMismatch, true);
  assert.match(p.error, /представя се за/);
});

test('съсед: отговор, който не е JSON, не минава за жив', async () => {
  const { srv, port } = await fakePeer((req, res) => { res.writeHead(200); res.end('<html>вход</html>'); });
  const p = await peerStatus({ id: 'x', name: 'X', url: `http://127.0.0.1:${port}`, token: 'ok' });
  srv.close();
  assert.equal(p.up, false);
  assert.match(p.error, /не е JSON/);
});

test('съсед: гигантски отговор не пълни паметта', async () => {
  // `/api/ping` е няколко реда. Съсед, който изсипва мегабайти, е счупен или
  // враждебен — и в двата случая не бива да го трупаме, докато решим кое.
  const { srv, port } = await fakePeer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"nodeId":"x","junk":"' + 'я'.repeat(3_000_000) + '"}');
  });
  const p = await peerStatus({ id: 'x', name: 'X', url: `http://127.0.0.1:${port}`, token: 'ok' });
  srv.close();
  assert.equal(p.up, false, 'отрязаният отговор не е валиден JSON → не е „жив"');
});

test('съсед: невалиден URL не хвърля', async () => {
  const p = await peerStatus({ id: 'x', name: 'X', url: 'не-е-урл', token: 'ok' });
  assert.equal(p.up, false);
  assert.match(p.error, /невалиден URL/);
});

test('съсед: грешка ПРИ ПОДГОТОВКАТА на заявката също се изолира', async () => {
  // Има два пътя към провал и двата трябва да са затворени: проверката на
  // токена (преди заявката) и синхронният хвърлей от самия `http.request`
  // (напр. невъзможна врата). Вторият е този, който заобикаля повечето уловки —
  // той се случва ИЗВЪН обещанието и без външния catch поваля целия списък.
  const p = await peerStatus({ id: 'x', name: 'X', url: 'http://127.0.0.1:99999', token: 'ok' });
  assert.equal(p.up, false);
  assert.ok(p.error, 'носи причина');
  const r = await nodesStatus({
    nodeId: 'аз', nodeName: 'Аз',
    peers: [{ id: 'x', name: 'X', url: 'http://127.0.0.1:99999', token: 'ok' }],
  });
  assert.equal(r.local.up, true, 'и локалният възел пак се вижда');
  assert.equal(r.peers[0].up, false);
});
