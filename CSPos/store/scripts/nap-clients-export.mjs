// Списък на клиентите, на които е продаден СУПТО — за задължението на
// производителя/разпространителя към НАП (чл. 52и Н-18). CSV на stdout.
// Пускане (на сървъра): node scripts/nap-clients-export.mjs > клиенти.csv

import { db } from "../lib/db.js";

const rows = db
  .prepare(
    `SELECT createdAt, email, buyerEik, plan, seats, status,
            substr(keyPlain, 1, 11) || '…' AS keyPrefix
     FROM licenses ORDER BY createdAt`
  )
  .all();

const esc = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`;
console.log("Дата,Имейл,ЕИК,План,Брой каси,Статус,Ключ (префикс)");
for (const r of rows) {
  console.log(
    [
      new Date(r.createdAt).toISOString().slice(0, 10),
      r.email,
      r.buyerEik,
      r.plan,
      r.seats,
      r.status,
      r.keyPrefix,
    ]
      .map(esc)
      .join(",")
  );
}
console.error(`Общо: ${rows.length} лиценза.`);
