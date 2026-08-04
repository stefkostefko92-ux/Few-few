import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Badge, Card, Field, Fields } from "@/components/DataCard";
import { appendAudit, readAudit, verifyAudit } from "@/lib/audit";
import { readSession } from "@/lib/case-context";
import { isInvestigationMode } from "@/lib/mode";
import { can, DENIED_MESSAGE } from "@/lib/permissions";
import { ROLE_LABEL } from "@/lib/session";

export const metadata: Metadata = { title: "Одиторски дневник", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Изгледът на одитора.
 *
 * Чл. 25 от Директива (ЕС) 2016/680 не иска само дневникът да СЪЩЕСТВУВА — той
 * се ползва за проверка на законосъобразността и за самоконтрол. Дневник, който
 * никой не може да прочете без достъп до сървъра, не върши тази работа.
 *
 * Самото отваряне на дневника също се вписва. Който надзирава, също е надзираван.
 */
export default async function AuditPage() {
  if (!isInvestigationMode()) redirect("/");

  const session = await readSession();
  if (!session) redirect("/vhod");

  if (!can(session.role, "readAudit")) {
    return (
      <div className="mx-auto max-w-2xl py-10">
        <Card title="Отказан достъп">
          <p className="text-sm text-text-muted">{DENIED_MESSAGE}</p>
          <p className="mt-3 text-sm text-text-faint">
            Ролята ти е „{ROLE_LABEL[session.role]}“. Дневникът се чете от ръководител или одитор.
          </p>
        </Card>
      </div>
    );
  }

  const integrity = verifyAudit();
  const { entries } = readAudit();
  // Най-новите отгоре: при проверка се гледа последното, не първото.
  const recent = [...entries].reverse().slice(0, 200);

  appendAudit({
    ts: new Date().toISOString(),
    actor: session.sub,
    actorUnit: session.unit,
    actorRole: session.role,
    action: "проверка-на-дневника",
    justification: "надзор по чл. 25",
    query: "",
    sources: [],
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-text">Одиторски дневник</h1>
        <p className="mt-1 text-sm text-text-muted">
          Отварянето на този изглед също се вписва — който надзирава, също е надзираван.
        </p>
      </header>

      <Card title="Цялост на веригата">
        <p className="mb-3">
          <Badge tone={integrity.intact ? "ok" : "danger"}>
            {integrity.intact ? "Веригата е цяла" : "Веригата е повредена"}
          </Badge>
        </p>
        <Fields>
          <Field label="Брой записи" value={String(integrity.entryCount)} />
          <Field
            label="Последно звено"
            value={integrity.tip ?? "не се определя — веригата е повредена"}
          />
        </Fields>
        {integrity.problems.length > 0 ? (
          <ul className="mt-3 space-y-1 text-sm text-danger">
            {integrity.problems.map((problem) => (
              <li key={`${problem.index}-${problem.kind}`}>
                ред {problem.index + 1}: {problem.kind} — {problem.detail}
              </li>
            ))}
          </ul>
        ) : null}
        {integrity.malformedLines.length > 0 ? (
          <p className="mt-3 text-sm text-warn">
            Нечетими редове: {integrity.malformedLines.join(", ")}
          </p>
        ) : null}
        <p className="mt-4 text-xs text-text-faint">
          Същата проверка се прави и независимо от приложението:{" "}
          <span className="value-mono">node scripts/verify-audit.mjs</span>. Проверката на дневник не бива
          да зависи от софтуера, който го пише.
        </p>
      </Card>

      <Card title={`Последни ${recent.length} записа`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border-strong text-xs uppercase tracking-wide text-text-muted">
                <th className="py-2 pr-3 font-semibold">Момент (UTC)</th>
                <th className="py-2 pr-3 font-semibold">Служител</th>
                <th className="py-2 pr-3 font-semibold">Действие</th>
                <th className="py-2 pr-3 font-semibold">Основание</th>
                <th className="py-2 font-semibold">Запитване</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((entry) => (
                <tr key={entry.hash} className="border-b border-border align-top">
                  <td className="py-2 pr-3 font-mono text-xs tabular-nums">{entry.ts.replace("T", " ").slice(0, 23)}</td>
                  <td className="py-2 pr-3">
                    {entry.actor}
                    <span className="block text-xs text-text-faint">{entry.actorUnit}</span>
                  </td>
                  <td className="py-2 pr-3">{entry.action}</td>
                  <td className="py-2 pr-3 text-text-muted">{entry.justification || "—"}</td>
                  <td className="py-2 font-mono text-xs">{entry.query || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {recent.length === 0 ? <p className="text-sm text-text-muted">Дневникът е празен.</p> : null}
      </Card>
    </div>
  );
}
