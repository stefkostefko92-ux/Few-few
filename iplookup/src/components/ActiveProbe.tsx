"use client";

import { useState } from "react";

import { Badge, Field, Fields } from "./DataCard";
import type { ProbeResult } from "@/lib/probe-types";

/**
 * Бутонът за активна проверка.
 *
 * Умишлено НЕ тръгва сам при отваряне на страницата: всяко обхождане от робот
 * би се превърнало в сканиране от наше име. Освен това потребителят трябва да
 * знае, че точно това действие оставя следа в дневника на отсрещната страна —
 * затова предупреждението стои НАД бутона, а не в дребен шрифт отдолу.
 */
export default function ActiveProbe({ ip }: { ip: string }) {
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [result, setResult] = useState<ProbeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setState("running");
    setError(null);
    try {
      const response = await fetch("/api/probe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ip }),
      });
      const payload = (await response.json()) as ProbeResult & { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "Проверката не успя.");
        setState("error");
        return;
      }
      setResult(payload);
      setState("done");
    } catch {
      setError("Проверката не успя — мрежова грешка.");
      setState("error");
    }
  }

  return (
    <div>
      <p className="mb-3 text-sm text-text-muted">
        За разлика от всичко останало тук, това не е справка в регистър, а{" "}
        <strong className="text-text">истинско свързване</strong> от нашия сървър към адреса. То ще се
        появи в дневниците на отсрещната страна. Прави се само по твое действие, само на осем познати
        порта, и е ограничено до пет проверки на минута.
      </p>

      {state !== "done" ? (
        <button type="button" className="btn-primary" onClick={run} disabled={state === "running"}>
          {state === "running" ? "Проверява се…" : "Пусни активна проверка"}
        </button>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {result ? <ProbeReport result={result} /> : null}
    </div>
  );
}

function ProbeReport({ result }: { result: ProbeResult }) {
  const open = result.ports.filter((port) => port.state === "open");

  return (
    <div className="mt-4 space-y-4">
      <div>
        <h3 className="card-title mb-2">Портове</h3>
        {open.length === 0 ? (
          <p className="text-sm text-text-muted">
            Никой от осемте проверени порта не отговори с успешно свързване. Това не значи, че адресът е
            неактивен — може да е зад защитна стена или да слуша на друг порт.
          </p>
        ) : null}
        <ul className="flex flex-wrap gap-2">
          {result.ports.map((port) => (
            <li key={port.port}>
              <Badge tone={port.state === "open" ? "warn" : "neutral"}>
                {port.port} · {port.service} ·{" "}
                {port.state === "open" ? "отворен" : port.state === "closed" ? "отказан" : "мълчи"}
              </Badge>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-text-faint">
          „Отказан“ значи, че някой отговори с отказ — тоест адресът е жив. „Мълчи“ значи, че нищо не се
          върна: обикновено защитна стена, която изхвърля пакетите.
        </p>
      </div>

      {result.tls ? (
        <div>
          <h3 className="card-title mb-2">Сертификат на порт 443</h3>
          {result.tls.expired ? (
            <p className="mb-2">
              <Badge tone="danger">Сертификатът е изтекъл</Badge>
            </p>
          ) : null}
          <Fields>
            <Field label="Издаден за" value={result.tls.subject} />
            <Field label="Издател" value={result.tls.issuer} mono={false} />
            <Field label="Валиден от" value={result.tls.validFrom} />
            <Field label="Валиден до" value={result.tls.validTo} />
            <Field label="Протокол" value={result.tls.protocol} />
            <Field
              label="Имена в сертификата"
              value={result.tls.names.join(", ")}
              note="Полето SAN изброява домейните, за които важи сертификатът — това често е най-прекият отговор на въпроса кой стои зад адреса."
            />
          </Fields>
        </div>
      ) : null}

      {result.httpServer ? (
        <div>
          <h3 className="card-title mb-2">HTTP банер</h3>
          <Fields>
            <Field label="Заглавие Server" value={result.httpServer} />
          </Fields>
        </div>
      ) : null}

      <p className="text-xs text-text-faint">Активната проверка отне {result.totalMs} ms.</p>
    </div>
  );
}
