// Déjà — тестова инфраструктура: локален HTTP сървър (страници + огледало на
// модела) и Chromium с временен профил + заредено разширение.
//
// Среда:
//   DEJA_CHROME       — път до Chromium/Chrome бинарка (задължително)
//   DEJA_MODEL_MIRROR — папка с HF layout на модела (по избор; без нея моделът
//                       се тегли от huggingface.co — иска интернет)
//   HTTPS_PROXY       — ако е зададено, браузърът минава през прокси (bypass localhost)

import { chromium } from 'playwright-core';
import http from 'node:http';
import { createReadStream, existsSync, statSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export const EXT = path.resolve(import.meta.dirname, '..', 'dist');
export const PORT = 18080;

export function startServer(pages) {
  const mirror = process.env.DEJA_MODEL_MIRROR;
  const server = http.createServer((req, res) => {
    const page = pages[req.url];
    if (page) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(
        `<!doctype html><html lang="bg"><head><title>${page.title}</title></head>` +
          `<body><main><h1>${page.title}</h1><p>${page.body}</p></main></body></html>`,
      );
    }
    if (mirror) {
      const filePath = path.join(mirror, decodeURIComponent(req.url));
      if (filePath.startsWith(mirror) && existsSync(filePath) && statSync(filePath).isFile()) {
        res.writeHead(200, {
          'content-type': 'application/octet-stream',
          'content-length': statSync(filePath).size,
          'access-control-allow-origin': '*',
        });
        return createReadStream(filePath).pipe(res);
      }
    }
    res.writeHead(404, { 'access-control-allow-origin': '*' });
    res.end('not found');
  });
  return new Promise((resolve) => server.listen(PORT, () => resolve(server)));
}

export async function launchWithExtension() {
  const executablePath = process.env.DEJA_CHROME;
  if (!executablePath) {
    throw new Error('Задай DEJA_CHROME=/път/до/chrome (тестовете искат реален Chromium)');
  }
  const userDir = mkdtempSync(path.join(tmpdir(), 'deja-test-'));
  const options = {
    headless: true,
    executablePath,
    args: [
      `--disable-extensions-except=${EXT}`,
      `--load-extension=${EXT}`,
      '--ignore-certificate-errors',
    ],
  };
  if (process.env.HTTPS_PROXY) {
    options.proxy = { server: process.env.HTTPS_PROXY, bypass: 'localhost' };
  }
  const context = await chromium.launchPersistentContext(userDir, options);

  let [sw] = context.serviceWorkers();
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 15000 });
  const extId = new URL(sw.url()).host;

  // при локално огледало пренасочваме модела към тестовия сървър
  if (process.env.DEJA_MODEL_MIRROR) {
    const setup = await context.newPage();
    await setup.goto(`chrome-extension://${extId}/search.html`);
    await setup.evaluate(
      (port) => chrome.storage.local.set({ settings: { modelHost: `http://localhost:${port}/` } }),
      PORT,
    );
    await setup.close();
  }
  return { context, extId };
}

export async function visitAll(context, pages) {
  for (const route of Object.keys(pages)) {
    const page = await context.newPage();
    await page.goto(`http://localhost:${PORT}${route}`);
    await page.waitForTimeout(4500); // content script-ът праща след SETTLE_MS
    await page.close();
  }
}

export async function waitForIndex(context, extId, minPages, timeoutSec = 180) {
  const probe = await context.newPage();
  await probe.goto(`chrome-extension://${extId}/search.html`);
  let pages = 0;
  for (let i = 0; i < timeoutSec / 3; i++) {
    await probe.waitForTimeout(3000);
    const res = await probe.evaluate(() => chrome.runtime.sendMessage({ type: 'deja:stats' }));
    pages = res?.result?.pages ?? 0;
    if (pages >= minPages) break;
  }
  await probe.close();
  return pages;
}

export function makeChecker() {
  let failures = 0;
  return {
    check(name, ok) {
      console.log(ok ? `✅ ${name}` : `❌ ${name}`);
      if (!ok) failures++;
    },
    finish() {
      console.log(failures === 0 ? '\n✅ ВСИЧКО МИНА' : `\n❌ ${failures} провала`);
      process.exit(failures === 0 ? 0 : 1);
    },
  };
}

// Достатъчно дълги фикстури (> MIN_TEXT=400 знака след извличане)
export const FIXTURES = {
  '/baterii': {
    title: 'Бъдещето на натриевите батерии',
    body: `Натриево-йонните батерии се очертават като евтина алтернатива на литиевите.
Натрият е хиляда пъти по-разпространен от лития и не изисква кобалт или никел.
Новите катодни материали на базата на пруско синьо позволяват плътност на енергията
от над 160 ватчаса на килограм, а животът на клетките надхвърля четири хиляди цикъла.
Китайските производители вече пускат серийни електромобили с натриеви батерии,
а европейските стартъпи разработват стационарни системи за съхранение на енергия
от възобновяеми източници. Основното предимство е цената на суровините.`,
  },
  '/gotvene': {
    title: 'Тайните на бавното готвене',
    body: `Бавното готвене превръща и най-жилавото месо в крехко удоволствие.
Тайната е в ниската температура и дългото време: осемдесет градуса за осем часа
правят чудеса със свинска плешка. Добавете корен селъри, моркови, дафинов лист
и чаша бяло вино. Ключът е да не бързате: колагенът се разгражда бавно и месото
се разпада на нежни влакна. Сервирайте с картофено пюре и карамелизиран лук.
Гответе с любов и търпение, защото добрата храна не обича припряността.`,
  },
};
