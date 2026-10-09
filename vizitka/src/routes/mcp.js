// MCP крайна точка (`POST /mcp`) — конекторът за ChatGPT и Claude.
//
// Без автентикация НАРОЧНО: сървърът отдава само съдържание, което вече е публично
// на сайта, плюс визитките с изрично съгласие. OAuth тук би поискал акаунт от всеки
// питащ, без да пази нищо повече — цената е реална, ползата нула. Пише се нищо:
// всички инструменти са само за четене.
import express from 'express';
import rateLimit from 'express-rate-limit';
import { baseUrl } from '../config.js';
import { handleRpc } from '../mcp/protocol.js';

const router = express.Router();

// По-щедро от /qr.png (един разговор прави няколко извиквания), но с таван: това е
// единствената точка, която чужда услуга удря по своя инициатива.
const mcpLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { jsonrpc: '2.0', error: { code: -32000, message: 'Твърде много заявки.' } },
});

// Защита от DNS rebinding: браузърът винаги праща Origin, а сървър-към-сървър
// извикване (какъвто е истинският MCP клиент) — не. Затова присъстващ Origin, който
// не е нашият, се отказва; липсващият се пропуска. Спецификацията иска точно 403.
function originGuard(req, res, next) {
  const origin = req.get('origin');
  if (!origin) return next();
  let ok = false;
  try {
    ok = new URL(origin).origin === new URL(baseUrl(req)).origin;
  } catch {
    ok = false;
  }
  if (ok) return next();
  return res.status(403).json({
    jsonrpc: '2.0',
    error: { code: -32600, message: 'Забранен Origin.' },
  });
}

const jsonBody = express.json({ limit: '256kb' });

// Тялото е JSON само тук — останалата част от приложението говори форми. Собствен
// парсер значи и собствена грешка: счупен JSON трябва да върне -32700, не HTML.
function parseBody(req, res, next) {
  jsonBody(req, res, (err) => {
    if (!err) return next();
    const tooBig = err.type === 'entity.too.large';
    return res.status(tooBig ? 413 : 400).json({
      jsonrpc: '2.0',
      error: {
        code: tooBig ? -32600 : -32700,
        message: tooBig ? 'Заявката е твърде голяма.' : 'Невалиден JSON.',
      },
    });
  });
}

router.post('/mcp', mcpLimiter, originGuard, parseBody, (req, res) => {
  const { status, body } = handleRpc(req.body, {
    headers: req.headers,
    base: baseUrl(req),
  });
  res.setHeader('Cache-Control', 'no-store');
  if (body === null) return res.status(status).end(); // 202 Accepted, без тяло
  res.status(status).json(body);
});

// GET/DELETE са от по-старите ревизии (самостоятелен SSE поток и край на сесия).
// Тази ревизия ги няма и отговорът е 405 — точно това клиентът очаква, за да не
// тръгне да ги ползва.
router.all('/mcp', (req, res) =>
  res
    .status(405)
    .set('Allow', 'POST')
    .json({
      jsonrpc: '2.0',
      error: { code: -32600, message: 'MCP крайната точка приема само POST.' },
    })
);

export default router;
