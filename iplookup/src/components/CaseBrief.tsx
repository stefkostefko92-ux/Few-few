"use client";

import { useMemo, useState } from "react";

import { Badge, Field, Fields } from "./DataCard";
import {
  buildBrief,
  wallClockToUtc,
  type CaseInput,
} from "@/lib/investigation";
import type { ParsedIp } from "@/lib/ip";
import type { LookupReport } from "@/lib/lookup";

/**
 * Следствената справка.
 *
 * Смята се изцяло в браузъра от вече наличния доклад — нищо не се изпраща
 * обратно към сървъра и нищо не се записва. Това е нарочно: докато няма
 * одиторски дневник и автентикация, инструментът не бива да натрупва следа от
 * това кой какво е търсил.
 *
 * Тонът на текстовете е важен колкото сметките. Инструментът трябва да
 * попречи на прочит „ето къде е човекът" — затова ограничението стои най-горе,
 * а не в бележка под черта.
 */

const ZONES = ["Europe/Sofia", "UTC", "Europe/Berlin", "Europe/London", "America/New_York"];

export default function CaseBrief({ ip, report }: { ip: ParsedIp; report: LookupReport }) {
  const [wallClock, setWallClock] = useState("");
  const [timezone, setTimezone] = useState("Europe/Sofia");
  const [port, setPort] = useState("");
  const [caseRef, setCaseRef] = useState("");
  const [copied, setCopied] = useState(false);

  const input: CaseInput = useMemo(() => {
    const parsedPort = Number(port);
    return {
      observedAt: wallClock ? wallClockToUtc(wallClock, timezone) : null,
      timezone,
      sourcePort:
        port.trim() !== "" && Number.isInteger(parsedPort) && parsedPort >= 0 && parsedPort <= 65535
          ? parsedPort
          : null,
      caseRef,
    };
  }, [wallClock, timezone, port, caseRef]);

  const brief = useMemo(() => buildBrief(ip, input, report), [ip, input, report]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(brief.draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-danger p-4">
        <p className="text-sm font-semibold text-danger">
          Геолокацията по IP не установява адрес на жилище.
        </p>
        <p className="mt-1 text-sm text-text-muted">
          Тя дава район с грешка от порядъка на десетки километри и не е основание за процесуално
          действие срещу конкретно лице. Идентификация се извършва само от оператора, по абонатните му
          записи, след законно искане. Ролята на този екран е искането да е пълно и правилно от първия
          път.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm text-text-muted">Момент на наблюдението</span>
          <input
            type="datetime-local"
            step="1"
            className="field-input"
            value={wallClock}
            onChange={(event) => setWallClock(event.target.value)}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-text-muted">Часова зона на момента</span>
          <select
            className="field-input"
            value={timezone}
            onChange={(event) => setTimezone(event.target.value)}
          >
            {ZONES.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-text-muted">
            Източников порт {brief.cgnat.suspected ? "(задължителен)" : "(ако е известен)"}
          </span>
          <input
            type="number"
            min={0}
            max={65535}
            className="field-input"
            value={port}
            placeholder="51234"
            onChange={(event) => setPort(event.target.value)}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-text-muted">Номер на преписка</span>
          <input
            type="text"
            className="field-input"
            value={caseRef}
            placeholder="ДП 000/2026"
            onChange={(event) => setCaseRef(event.target.value)}
          />
        </label>
      </div>

      {/* Оценката за CGNAT носи СТЕПЕН на увереност — отвън разликата не се
          вижда със сигурност и инструментът не бива да внушава, че се вижда. */}
      <div>
        <p className="mb-2">
          <Badge tone={brief.cgnat.suspected ? "warn" : "neutral"}>
            {brief.cgnat.suspected
              ? `Операторски NAT — ${brief.cgnat.certainty}`
              : "Няма признак за операторски NAT"}
          </Badge>
        </p>
        <p className="text-sm text-text-muted">{brief.cgnat.reason}</p>
      </div>

      <div>
        <h3 className="card-title mb-2">Какво трябва да съдържа искането</h3>
        <ul className="space-y-2">
          {brief.requirements.map((requirement) => (
            <li key={requirement.key} className="text-sm">
              <span className={requirement.satisfied ? "text-ok" : requirement.mandatory ? "text-danger" : "text-text-faint"}>
                <span aria-hidden="true">{requirement.satisfied ? "✔" : requirement.mandatory ? "✖" : "○"}</span>{" "}
                <span className="sr-only">
                  {requirement.satisfied ? "готово:" : requirement.mandatory ? "липсва:" : "по избор:"}
                </span>
                <strong>{requirement.label}</strong>
              </span>
              <span className="block text-text-faint">{requirement.why}</span>
            </li>
          ))}
        </ul>
      </div>

      {brief.blockers.length > 0 ? (
        <div className="rounded-lg border border-warn p-4">
          <h3 className="text-sm font-semibold text-warn">Защо искането може да се върне празно</h3>
          <ul className="mt-2 space-y-1.5 text-sm text-text-muted">
            {brief.blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div>
        <h3 className="card-title mb-2">Адресат</h3>
        <Fields>
          <Field label="Мрежа" value={brief.operator.network} />
          <Field label="Организация" value={brief.operator.organisation} mono={false} />
          <Field
            label="Автономна система"
            value={brief.operator.asn ? `AS${brief.operator.asn} — ${brief.operator.asName ?? ""}` : undefined}
          />
          <Field
            label="Контакт за злоупотреби"
            value={brief.operator.abuseEmail}
            note="Това е техническият контакт. Искането за абонатни данни се адресира до законния представител на оператора."
          />
          <Field label="Регистър" value={brief.operator.registry} mono={false} />
        </Fields>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-3">
          <h3 className="card-title">Чернова на искането</h3>
          <button type="button" className="btn-ghost text-sm" onClick={copy}>
            {copied ? "Копирано" : "Копирай"}
          </button>
        </div>
        <pre className="max-h-96 overflow-auto rounded-lg border border-border bg-surface-raised p-4 text-xs leading-relaxed text-text">
          {brief.draft}
        </pre>
        <p className="mt-2 text-xs text-text-faint">
          Черновата е техническа заготовка. Правното основание, адресатът и формата се проверяват от
          съставителя. Това не е правен съвет.
        </p>
      </div>
    </div>
  );
}
