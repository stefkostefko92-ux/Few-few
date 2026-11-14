// Справки по Прил. № 29, т. 18: визуализация (JSON, със страниране — т. 17) и експорт в CSV
// или XLSX с филтри по период, ФУ, работно място и оператор. Четящ маршрут → достъпен за
// одиторския профил (т. 19).

import { guard, jsonError, requireRead } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { toCsv } from "@/lib/csv";
import { buildXlsx, type XlsxCell } from "@/lib/xlsx";
import { buildReport, type ReportFilters } from "@/lib/supto-reports";
import { periodCurrencyError, suptoTable } from "@/lib/supto-export";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  return guard(async () => {
    const s = await requireRead("MANAGER");
    const url = new URL(req.url);
    const id = url.searchParams.get("table") ?? "18.1";
    const table = suptoTable(id);
    if (!table) throw jsonError(400, "Непозната справка.");

    const from = url.searchParams.get("from") ?? "";
    const to = url.searchParams.get("to") ?? "";
    if (table.id !== "18.9" && (!DAY.test(from) || !DAY.test(to) || from > to)) {
      throw jsonError(400, "Задайте период „от“ и „до“ (ГГГГ-ММ-ДД).");
    }
    const currencyError = table.id === "18.9" ? null : periodCurrencyError(from, to);
    if (currencyError) throw jsonError(400, currencyError);

    const op = url.searchParams.get("operator");
    const filters: ReportFilters = {
      from: from || "2000-01-01",
      to: to || "2999-12-31",
      operatorCode: op && /^\d{1,4}$/.test(op) ? Number(op) : null,
      device: url.searchParams.get("device") || null,
      workplace: url.searchParams.get("workplace") || null,
    };
    const { rows } = await buildReport(table.id, filters);
    const format = url.searchParams.get("format") ?? "json";

    if (format === "json") {
      const take = Math.min(Math.max(parseInt(url.searchParams.get("take") ?? "100", 10) || 100, 1), 500);
      const skip = Math.max(parseInt(url.searchParams.get("skip") ?? "0", 10) || 0, 0);
      return Response.json({
        table: { id: table.id, title: table.title, headers: table.headers, kinds: table.columns.map((c) => c.kind ?? "text") },
        total: rows.length,
        rows: rows.slice(skip, skip + take),
      });
    }

    await audit(s.userId, "NAP_EXPORT", "Report", table.id, { format, ...filters });
    const base = `supto-${table.id.replace(".", "_")}-${from || "nomenklaturi"}-${to}`.replace(/-$/, "");

    if (format === "csv") {
      return new Response(toCsv([table.headers, ...rows]), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${base}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }
    if (format === "xlsx") {
      const kinds = table.columns.map((c) => c.kind ?? "text");
      const typed: XlsxCell[][] = rows.map((r) =>
        r.map((v, i) => (kinds[i] === "money" || kinds[i] === "qty") && v !== "" ? Number(v) : v)
      );
      const bytes = buildXlsx(`${table.id} ${table.title}`, [table.headers, ...typed]);
      return new Response(bytes, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${base}.xlsx"`,
          "Cache-Control": "no-store",
        },
      });
    }
    throw jsonError(400, "Форматът е json, csv или xlsx.");
  });
}
