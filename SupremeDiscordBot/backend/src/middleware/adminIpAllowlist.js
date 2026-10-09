// backend/src/middleware/adminIpAllowlist.js
// Незадължителен IP allowlist за админ конзолата (/api/admin).
//
// ADMIN_IP_ALLOWLIST="203.0.113.7, 198.51.100.0/24, 2001:db8::/32"
// Празно/липсващо = изключено (нищо не се блокира). Зададено = само изброените
// адреси/подмрежи стигат до админ маршрутите; останалите получават 403
// ADMIN_IP_BLOCKED, одит SECURITY_ADMIN_IP_DENIED (дроселиран) и DM до
// собственика. Сравнението е ДВОИЧНО (net.BlockList), не по низ — както в
// SSRF гарда; IPv4-mapped IPv6 се нормализира.
//
// Това е ТРЕТИ слой над Discord OAuth + TOTP, не заместител. Ако собственикът
// смени мрежата и се заключи навън, единственият път е env промяна + рестарт —
// затова е по избор и изрично документиран.
import { BlockList, isIP } from "node:net";

let cached = { raw: null, list: null, entries: 0 };
const denied = new Map(); // ip → последен одит (дросел 15 min)

function normalizeIp(ip) {
  const s = String(ip || "");
  return s.startsWith("::ffff:") && isIP(s.slice(7)) === 4 ? s.slice(7) : s;
}

export function buildAllowlist(raw) {
  const list = new BlockList();
  let entries = 0;
  for (const part of String(raw || "").split(",").map((p) => p.trim()).filter(Boolean)) {
    const [addr, prefix] = part.split("/");
    const fam = isIP(addr);
    if (!fam) continue; // невалиден запис се игнорира (и се вижда в /system)
    const type = fam === 4 ? "ipv4" : "ipv6";
    if (prefix !== undefined) list.addSubnet(addr, Number(prefix), type);
    else list.addAddress(addr, type);
    entries++;
  }
  return { list, entries };
}

export function allowlistState() {
  const raw = process.env.ADMIN_IP_ALLOWLIST || "";
  if (raw !== cached.raw) {
    const built = buildAllowlist(raw);
    cached = { raw, list: built.list, entries: built.entries };
  }
  return { enabled: cached.entries > 0, entries: cached.entries };
}

export function ipAllowed(ip) {
  const state = allowlistState();
  if (!state.enabled) return true;
  const n = normalizeIp(ip);
  const fam = isIP(n);
  if (!fam) return false;
  return cached.list.check(n, fam === 4 ? "ipv4" : "ipv6");
}

export function adminIpAllowlist(req, res, next) {
  if (ipAllowed(req.ip)) return next();
  const ip = normalizeIp(req.ip);
  const now = Date.now();
  if (now - (denied.get(ip) || 0) > 15 * 60 * 1000) {
    denied.set(ip, now);
    Promise.resolve().then(async () => {
      const { writeAudit } = await import("../lib/auditLog.js");
      await writeAudit({ actorId: req.user?.id || null, actorTag: req.user ? undefined : "SYSTEM", action: "SECURITY_ADMIN_IP_DENIED", targetId: "admin", metadata: { ip, path: req.originalUrl } });
      const { alertOwner, ALERT_KINDS } = await import("../lib/securityAlerts.js");
      await alertOwner(ALERT_KINDS.ADMIN_IP_DENIED, "Admin console reached from an address outside the allowlist",
        `A logged-in ${req.user?.globalRole || "user"} (${req.user?.username || "?"}) tried ${req.originalUrl} from ${ip}. Blocked by ADMIN_IP_ALLOWLIST.`);
    }).catch(() => {});
  }
  return res.status(403).json({ error: "The admin console is not available from this network.", code: "ADMIN_IP_BLOCKED" });
}
