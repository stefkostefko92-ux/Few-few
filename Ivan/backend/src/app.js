"use strict";
// Приложението без слушане на порт — index.js го пуска, тестовете го викат директно.
// Фронтендът е на същия адрес (nginx праща /api тук), затова CORS няма: чужд сайт не чете отговорите.
const express = require("express");
const { sameOriginJson, requireUser } = require("./security");
const { createLoginLimiter } = require("./limiter");
const { HttpError } = require("./access");

function createApp({ prisma, config, log, limiter = createLoginLimiter() }) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", config.trustProxy);
  app.use(express.json({ limit: "100kb" }));
  app.use(sameOriginJson);

  app.get("/api/health", (_req, res) => res.json({ status: "ok", time: new Date().toISOString() }));
  app.use("/api/auth", require("./routes/auth")({ prisma, config, limiter }));

  // Всичко по-нататък иска жива сесия.
  app.use("/api", requireUser({ prisma, config }));
  app.use("/api/roles", require("./routes/roles")({ prisma }));
  app.use("/api/users", require("./routes/users")({ prisma }));
  app.use("/api", require("./routes/stock")({ prisma }));
  app.use("/api", require("./routes/admin")({ prisma }));
  app.use("/api", (_req, res) => res.status(404).json({ error: "Няма такъв адрес" }));

  // Грешките: съобщението за клиента е общо, подробностите са само в лога (без лични данни).
  app.use((err, req, res, _next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Невалиден JSON" });
    if (err.type === "entity.too.large") return res.status(413).json({ error: "Твърде голяма заявка" });
    log.error({ err: { message: err.message, code: err.code }, method: req.method, path: req.path }, "request failed");
    res.status(500).json({ error: "Вътрешна грешка" });
  });

  return app;
}

module.exports = { createApp };
