// bot/src/middleware/secret.js
import { timingSafeEqual } from "crypto";

export function requireBotSecret(req, res, next) {
  const secret = req.headers["x-bot-secret"];
  const expected = process.env.API_SECRET;
  if (!secret || !expected) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const a = Buffer.from(String(secret));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}
