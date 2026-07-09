"use client";

// Одиторски дневник (СУПТО стил): пълна следа на действията, само четене.

import { useEffect, useState } from "react";
import { Spinner, Badge, apiJson } from "@/components/ui";

interface Log {
  id: string;
  action: string;
  entity: string | null;
  entityId: string | null;
  detail: string | null;
  createdAt: string;
  user: { name: string; operatorCode: number } | null;
}

const ACTION_LABELS: Record<string, { label: string; tone: "neutral" | "success" | "danger" | "warning" | "info" }> = {
  LOGIN: { label: "Вход", tone: "info" },
  LOGIN_FAILED: { label: "Неуспешен вход", tone: "danger" },
  LOGOUT: { label: "Изход", tone: "neutral" },
  SALE_COMPLETED: { label: "Продажба", tone: "success" },
  STORNO: { label: "Сторно", tone: "danger" },
  FISCAL_FAILED: { label: "Грешка ФУ", tone: "danger" },
  STORNO_FISCAL_FAILED: { label: "Грешка ФУ (сторно)", tone: "danger" },
  SHIFT_OPEN: { label: "Отваряне на смяна", tone: "info" },
  SHIFT_CLOSE: { label: "Закриване на смяна", tone: "info" },
  CASH_IN: { label: "Служебно въвеждане", tone: "warning" },
  CASH_OUT: { label: "Служебно извеждане", tone: "warning" },
  PRICE_CHANGE: { label: "Промяна на цена", tone: "warning" },
  PRODUCT_CREATE: { label: "Нова стока", tone: "neutral" },
  PRODUCT_UPDATE: { label: "Промяна на стока", tone: "neutral" },
  PRODUCT_DEACTIVATE: { label: "Спиране на стока", tone: "neutral" },
  DELIVERY: { label: "Доставка", tone: "success" },
  STOCKTAKE: { label: "Ревизия", tone: "info" },
  WRITEOFF: { label: "Брак", tone: "warning" },
  SETTINGS_CHANGE: { label: "Настройки", tone: "warning" },
  USER_CREATE: { label: "Нов потребител", tone: "info" },
  USER_UPDATE: { label: "Промяна на потребител", tone: "info" },
  NAP_EXPORT: { label: "Експорт НАП", tone: "info" },
  LINE_CANCELED: { label: "Анулиран ред", tone: "warning" },
  CART_CLEARED: { label: "Анулиран бон (незапочнат)", tone: "warning" },
  CREDIT_SETTLED: { label: "Погасена вересия", tone: "success" },
  PROMOTION_CREATE: { label: "Нова промоция", tone: "info" },
  PROMOTION_UPDATE: { label: "Промяна на промоция", tone: "neutral" },
  PROMOTION_DEACTIVATE: { label: "Спряна промоция", tone: "neutral" },
  INVOICE_ISSUED: { label: "Издадена фактура", tone: "info" },
  XREPORT: { label: "X-отчет", tone: "neutral" },
  ZREPORT: { label: "Z-отчет", tone: "neutral" },
};

export default function JournalPage() {
  const [logs, setLogs] = useState<Log[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/audit?take=200")
      .then((r) => apiJson<{ logs: Log[] }>(r))
      .then((j) => setLogs(j.logs))
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="text-coral-600">{error}</p>;
  if (!logs) return <Spinner label="Зареждане на дневника…" />;

  return (
    <div className="space-y-5 animate-fade-up">
      <div>
        <h1 className="text-2xl font-black">Одиторски дневник</h1>
        <p className="text-ink-400 text-sm mt-1">
          Несменяема следа на всички действия — основа за СУПТО одит (Прил. № 29) и за
          материалната отговорност по КТ. Записите не могат да се редактират или трият.
        </p>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-ink-400 text-left border-b border-ink-800">
              <th className="py-3 px-4 font-medium w-44">Кога</th>
              <th className="py-3 px-2 font-medium w-48">Кой</th>
              <th className="py-3 px-2 font-medium w-48">Действие</th>
              <th className="py-3 px-4 font-medium">Подробности</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => {
              const a = ACTION_LABELS[l.action] ?? { label: l.action, tone: "neutral" as const };
              return (
                <tr key={l.id} className="border-b border-ink-800/60 last:border-0 align-top">
                  <td className="py-2.5 px-4 text-ink-400 tabular-nums">
                    {new Date(l.createdAt).toLocaleString("bg-BG")}
                  </td>
                  <td className="py-2.5 px-2">
                    {l.user ? `${l.user.name} (код ${l.user.operatorCode})` : "—"}
                  </td>
                  <td className="py-2.5 px-2">
                    <Badge tone={a.tone}>{a.label}</Badge>
                  </td>
                  <td className="py-2.5 px-4 font-mono text-xs text-ink-400 break-all">
                    {l.detail ?? ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
