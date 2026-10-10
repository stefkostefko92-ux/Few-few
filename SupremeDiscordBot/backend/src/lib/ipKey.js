// backend/src/lib/ipKey.js
// Ключ за лимитите по IP. IPv6 се групира по /56: един абонат обикновено
// получава цяла /56 (или /64) и сменя адресите в нея на воля — лимит „по
// адрес“ (/128) е безсмислен срещу такъв нападател (Кодаджията, 10.10.2026).
// IPv4 и IPv4-mapped IPv6 (::ffff:1.2.3.4) остават по адрес.
import { isIPv4, isIPv6 } from "node:net";

function expandV6(ip) {
  const [head, tail] = ip.split("::");
  const h = head ? head.split(":") : [];
  const t = tail !== undefined && tail !== "" ? tail.split(":") : [];
  if (tail === undefined) return h;
  return [...h, ...Array(8 - h.length - t.length).fill("0"), ...t];
}

export function ipKey(ip) {
  const s = String(ip || "").trim();
  const mapped = s.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (mapped) return mapped[1];
  if (isIPv4(s)) return s;
  if (!isIPv6(s.split("%")[0])) return s;
  const parts = expandV6(s.split("%")[0].toLowerCase());
  if (parts.length !== 8) return s;
  const words = parts.map((p) => parseInt(p || "0", 16));
  // /56 = 3 пълни думи + горния байт на четвъртата
  const prefix = [words[0], words[1], words[2], words[3] & 0xff00].map((w) => w.toString(16)).join(":");
  return `${prefix}::/56`;
}

/** keyGenerator за express-rate-limit — по IP (IPv6 по /56). */
export const ipKeyGenerator = (req) => ipKey(req.ip);
