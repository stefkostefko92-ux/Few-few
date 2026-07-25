import { prisma } from "@/lib/prisma.ts";
import { verificaAudit, canonico } from "@/lib/audit-hmac.ts";
const key = process.env.AUDIT_HMAC_KEY!;
const righe = await prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 500 });
let bad=0, good=0;
const pattern: Record<string, {good:number,bad:number}> = {};
for (const r of righe) {
  const v = (r.versioneFirma===1?1:2) as 1|2;
  const ok = verificaAudit({azione:r.azione,entita:r.entita,entitaId:r.entitaId,dettagli:r.dettagli??null,ip:r.ip,userAgent:r.userAgent,utenteId:r.utenteId,createdAt:r.createdAt}, r.hmac, key, v);
  const k = r.azione + (r.ip?"|ip":"") + (r.userAgent?"|ua":"") + (r.dettagli?"|det":"");
  pattern[k] ??= {good:0,bad:0};
  ok ? (good++, pattern[k].good++) : (bad++, pattern[k].bad++);
  if (!ok && bad<=3) {
    console.log("BAD row:", r.azione, "createdAt=", r.createdAt.toISOString(), "ms="+r.createdAt.getMilliseconds(), "ip=", r.ip, "ua=", r.userAgent?.slice(0,20), "detKeys=", r.dettagli?Object.keys(r.dettagli as object):null);
    console.log("  canonico:", canonico({azione:r.azione,entita:r.entita,entitaId:r.entitaId,dettagli:r.dettagli??null,ip:r.ip,userAgent:r.userAgent,utenteId:r.utenteId,createdAt:r.createdAt},2).slice(0,200));
  }
}
console.log("GOOD",good,"BAD",bad);
console.log("PATTERN (azione|flags → good/bad):");
for (const [k,v] of Object.entries(pattern)) console.log(" ", k, "→", v.good+"/"+v.bad);
await prisma.$disconnect();
