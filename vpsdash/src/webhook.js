// Входящ webhook от GitHub — известява, че има нов релийз/push. САМО известява.
//
// Съзнателно НЕ деплойва. Канонът на репото е: архивът се качва ръчно, деплоят се
// пуска изрично. Автоматичен деплой по webhook значи, че всеки, който успее да
// подправи заявка (или да пусне комит), стартира изпълнение на код на сървъра —
// и то по път, който заобикаля човека. Известието дава същата полза („има нещо
// ново"), без да сваля бариерата.
//
// Затова маршрутът е ЕДИНСТВЕНИЯТ без сесия — и понася цялата защита сам:
//   · HMAC-SHA256 подпис (`X-Hub-Signature-256`), сравнен в постоянно време
//   · таван на тялото (без него всеки може да ни изяде паметта)
//   · нищо от тялото не се изпълнява — само се чете и форматира
import crypto from 'node:crypto';

const MAX_BODY = 1024 * 1024; // GitHub праща под 25 MB; за нашата цел 1 MB стига

// Тялото трябва да е СУРОВО — подписът е върху точните байтове, а JSON.parse +
// stringify ги променя (реда на ключовете, интервалите) и подписът пада.
export function readRaw(req, { limit = MAX_BODY } = {}) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        req.destroy();
        reject(Object.assign(new Error('Твърде голямо тяло'), { status: 413 }));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export function verifySignature(secret, rawBody, header) {
  const sig = String(header || '');
  if (!secret || !sig.startsWith('sha256=')) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  // timingSafeEqual хвърля при различна дължина — сравняваме я предварително,
  // а не с `===` върху самите низове (това би текло по време).
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// Превежда събитието в едно изречение на български. Всичко от GitHub е ДАННИ,
// не инструкции — режем дължините и не следваме нищо от съдържанието.
export function describe(event, payload) {
  // ВСИЧКО от GitHub минава през `cut`: реже дължината и маха новите редове.
  // Име на репо с вграден „\n" иначе рисува втори, престорен ред в известието —
  // фалшива „критична аларма" в Telegram, написана от този, който е пуснал комита.
  const cut = (s, n) => String(s ?? '').replace(/[\r\n]+/g, ' ').slice(0, n);
  const repo = cut(payload?.repository?.full_name || '?', 120);
  const who = cut(payload?.sender?.login || '?', 80);

  switch (event) {
    case 'ping':
      return { title: `GitHub webhook е свързан (${repo})`, body: 'Проверката премина успешно.', severity: 'info' };
    case 'release': {
      if (payload?.action !== 'published') return null;
      const tag = cut(payload?.release?.tag_name, 60);
      return {
        title: `Нов релийз ${tag} в ${repo}`,
        body: `Публикуван от ${who}. Изтегли архива и пусни деплой от панела, когато си готов.`,
        severity: 'info',
      };
    }
    case 'push': {
      const ref = cut(payload?.ref, 80).replace('refs/heads/', '');
      const n = Array.isArray(payload?.commits) ? payload.commits.length : 0;
      // Само основният клон — иначе всеки push по всеки feature клон вибрира телефона.
      if (!/^(main|master)$/.test(ref)) return null;
      const first = cut(payload?.head_commit?.message, 140);
      return {
        title: `Нов код в ${repo} (${ref})`,
        body: `${n} комит(а) от ${who}${first ? `\nПоследен: ${first}` : ''}`,
        severity: 'info',
      };
    }
    case 'workflow_run': {
      const wr = payload?.workflow_run;
      if (payload?.action !== 'completed' || !wr) return null;
      if (wr.conclusion === 'success') return null; // зелено CI не е новина
      return {
        title: `CI се провали: ${cut(wr.name, 80)} (${repo})`,
        body: `Заключение „${cut(wr.conclusion, 40)}" по ${cut(wr.head_branch, 80)}.`,
        severity: 'warning',
      };
    }
    default:
      return null; // неинтересно събитие — тихо 200, не грешка
  }
}

// Правилният отговор на непознато/неинтересно събитие е 200: GitHub изключва
// webhook-и, които постоянно връщат грешка.
// Отхвърлените заявки се записват най-много веднъж на минута: маршрутът е
// публичен, а одитът е файл на диска — иначе всеки може да го надуе с боклук и
// да удави истинските записи (и диска).
let lastReject = 0;
export function _resetRejectThrottle() {
  lastReject = 0;
}

export async function handleGithub(req, rawBody, cfg, alerts, audit) {
  const secret = cfg.webhook?.githubSecret || '';
  if (!secret) throw Object.assign(new Error('Webhook не е настроен'), { status: 404 });
  if (!verifySignature(secret, rawBody, req.headers['x-hub-signature-256'])) {
    const now = Date.now();
    if (now - lastReject > 60000) {
      lastReject = now;
      audit?.log({ action: 'webhook.rejected', event: String(req.headers['x-github-event'] || '').slice(0, 40) });
    }
    throw Object.assign(new Error('Невалиден подпис'), { status: 401 });
  }
  const event = String(req.headers['x-github-event'] || '').slice(0, 40);
  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    throw Object.assign(new Error('Невалиден JSON'), { status: 400 });
  }
  const msg = describe(event, payload);
  audit?.log({ action: 'webhook.github', event, repo: String(payload?.repository?.full_name || '').slice(0, 120), notified: Boolean(msg) });
  if (!msg) return { ok: true, event, notified: false };
  await alerts.event({ key: `github:${event}`, severity: msg.severity, title: msg.title, body: msg.body });
  return { ok: true, event, notified: true };
}
