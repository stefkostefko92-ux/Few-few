import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { Badge, Card, EmptyNote, Field, Fields } from "@/components/DataCard";
import ActiveProbe from "@/components/ActiveProbe";
import CaseBrief from "@/components/CaseBrief";
import SearchForm from "@/components/SearchForm";
import WorldMap, { countryCentre, formatCoordinates } from "@/components/WorldMap";
import {
  embeddedIpv4,
  interfaceIdentifier,
  parseIp,
  reverseName,
  specialRange,
  type ParsedIp,
} from "@/lib/ip";
import { bestCountry, lookup, type LookupReport } from "@/lib/lookup";
import { capabilities, isInvestigationMode } from "@/lib/mode";
import { readCaseContext } from "@/lib/case-context";
import { can, DENIED_MESSAGE } from "@/lib/permissions";
import { appendAudit } from "@/lib/audit";
import CaseGate from "@/components/CaseGate";
import FreezeButton from "@/components/FreezeButton";

interface PageProps {
  params: Promise<{ ip: string }>;
}

/**
 * Страницата с резултат НЕ се индексира.
 *
 * Това не е SEO предпазливост, а решение от правния преглед: страницата
 * съдържа данни за трети лица от публични регистри, а индексирането от търсачка
 * я превръща в постоянен, търсим указател — точно усилването, което обръща
 * баланса при преценката по чл. 6(1)(е) от ОРЗД. Инструментът си остава
 * публичен и напълно използваем; просто резултатите не стават указател.
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { ip } = await params;
  const parsed = parseIp(decodeURIComponent(ip));
  return {
    title: parsed ? `${parsed.normalized} — справка` : "Невалиден адрес",
    robots: { index: false, follow: false, nocache: true },
  };
}

export default async function IpPage({ params }: PageProps) {
  const { ip: rawParam } = await params;
  const raw = decodeURIComponent(rawParam);
  const parsed = parseIp(raw);

  if (!parsed) return <InvalidAddress raw={raw} />;
  // Един адрес — един URL. `2001:0db8::0001` и `2001:db8::1` са същото нещо.
  if (parsed.normalized !== raw) redirect(`/ip/${encodeURIComponent(parsed.normalized)}`);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-text-muted">Справка за адрес</p>
        <h1 className="mt-1 break-all font-mono text-2xl font-bold text-text sm:text-3xl">
          {parsed.normalized}
        </h1>
      </header>

      {/* Локалният анализ не чака нищо — рисува се веднага, още преди първата
          мрежова заявка да е тръгнала. */}
      <LocalAnalysis ip={parsed} />

      <Suspense fallback={<NetworkSkeleton />}>
        <NetworkAnalysis ip={parsed} />
      </Suspense>

      <Card title="Провери друг адрес">
        <SearchForm />
      </Card>
    </div>
  );
}

// ── Локално: това, което самият адрес издава ──────────────────────────────

function LocalAnalysis({ ip }: { ip: ParsedIp }) {
  const special = specialRange(ip);
  const embedded = embeddedIpv4(ip);
  const interfaceId = interfaceIdentifier(ip);

  return (
    <div className="space-y-6">
      {special ? (
        <Card title="Специален диапазон">
          <p className="mb-3">
            <Badge tone="warn">{special.name}</Badge>
          </p>
          <p className="text-sm text-text-muted">{special.note}</p>
          <p className="mt-3 text-sm text-text-faint">
            Блок <span className="value-mono">{special.cidr}</span> · {special.rfc}. Затова не
            питаме външните регистри — за такъв адрес те или мълчат, или си измислят.
          </p>
        </Card>
      ) : null}

      <Card title="Самият адрес">
        <Fields>
          <Field label="Версия" value={`IPv${ip.version}`} mono={false} />
          {ip.version === 6 ? <Field label="Пълна форма" value={ip.expanded} /> : null}
          <Field
            label="Име за обратна справка"
            value={reverseName(ip)}
            note="Името, което се пита в DNS, за да се намери домейнът на адреса."
          />
        </Fields>
      </Card>

      {embedded ? (
        <Card title="Вграден IPv4 адрес">
          <p className="mb-3">
            <Badge tone="info">{embedded.mechanism}</Badge>
          </p>
          <Fields>
            <Field label="Вграден адрес" value={embedded.ipv4} />
            <Field label="Порт на клиента" value={embedded.port?.toString()} />
            <Field label="Адрес на посредника" value={embedded.serverIpv4} />
          </Fields>
          <p className="mt-3 text-sm text-text-muted">{embedded.explanation}</p>
        </Card>
      ) : null}

      {interfaceId ? (
        <Card title="Интерфейсен идентификатор (долните 64 бита)">
          <p className="mb-3">
            <Badge tone={interfaceId.kind === "eui64" ? "warn" : "neutral"}>
              {interfaceId.label}
            </Badge>
          </p>
          <Fields>
            <Field label="MAC адрес" value={interfaceId.mac} />
            <Field
              label="Производител (OUI)"
              value={interfaceId.oui}
              note="Първите три октета определят производителя на мрежовата карта."
            />
          </Fields>
          <p className="mt-3 text-sm text-text-muted">{interfaceId.detail}</p>
        </Card>
      ) : null}
    </div>
  );
}

// ── Мрежово: това, за което трябва да питаме други ────────────────────────

async function NetworkAnalysis({ ip }: { ip: ParsedIp }) {
  // В следствен режим справка без обосновка изобщо не тръгва: одиторският
  // запис я изисква, а обосновка след видян резултат не е обосновка.
  const caseContext = isInvestigationMode() ? await readCaseContext() : null;

  // Одиторът не прави справки: който проверява законосъобразността на чуждите
  // справки, не бива да е и източник на такива.
  if (caseContext && !can(caseContext.session.role, "lookup")) {
    return (
      <Card title="Отказан достъп">
        <p className="text-sm text-text-muted">{DENIED_MESSAGE}</p>
      </Card>
    );
  }

  if (isInvestigationMode() && !caseContext) {
    return (
      <Card
        title="Преди справката"
        hint="Всяка справка се записва в одиторския дневник заедно с основанието си."
      >
        <CaseGate />
      </Card>
    );
  }

  const report = await lookup(ip);

  if (caseContext) {
    // Записва се СЛЕД справката, защото едва тогава се знае кои източници са
    // отговорили — а точно те са проследимостта.
    appendAudit({
      ts: new Date().toISOString(),
      actor: caseContext.session.sub,
      actorUnit: caseContext.session.unit,
      actorRole: caseContext.session.role,
      action: "справка",
      justification: caseContext.justification,
      query: ip.normalized,
      sources: [report.rdap, report.origin, report.ptr, report.provider, report.reputation, report.geoip]
        .filter((source) => source?.status === "ok")
        .map((source) => source!.source),
    });
  }

  if (!report.local.globallyRoutable) {
    return (
      <Card title="Външни източници">
        <p className="text-sm text-text-muted">
          Адресът не е публично маршрутизируем, затова не бяха направени външни справки.
        </p>
      </Card>
    );
  }

  const country = bestCountry(report);
  const { rdap, origin, ptr, provider, reputation, geofeed, geoip } = report;

  return (
    <div className="space-y-6">
      {reputation?.data && reputation.data.hits.length > 0 ? (
        <Card title="Репутация" source={reputation}>
          <div className="flex flex-wrap gap-2">
            {reputation.data.hits.map((hit) => (
              <Badge key={hit.list} tone={hit.severity}>
                {hit.list}
              </Badge>
            ))}
          </div>
          <ul className="mt-3 space-y-2 text-sm text-text-muted">
            {reputation.data.hits.map((hit) => (
              <li key={hit.list}>
                {hit.claim}
                {hit.reference ? <span className="value-mono"> ({hit.reference})</span> : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card title="Мрежа и регистър" source={rdap}>
        {rdap?.data ? (
          <Fields>
            <Field label="Име на мрежата" value={rdap.data.name} />
            <Field label="Блок" value={rdap.data.cidr ?? rangeText(rdap.data.startAddress, rdap.data.endAddress)} />
            <Field label="Идентификатор" value={rdap.data.handle} />
            <Field label="Тип разпределение" value={rdap.data.type} />
            <Field label="Регистър" value={rdap.data.registry} mono={false} />
            <Field
              label="Държава по регистрация"
              value={rdap.data.country}
              note="Държавата на организацията в регистъра. Това НЕ е местоположението на адреса."
            />
            <Field label="Регистриран на" value={formatDate(rdap.data.registered)} />
            <Field label="Последна промяна" value={formatDate(rdap.data.lastChanged)} />
            <Field
              label="Контакт при злоупотреба"
              value={rdap.data.abuse?.email ?? rdap.data.abuse?.name}
              note={
                rdap.data.abuse
                  ? "Това е адресът, на който се подават оплаквания за трафик от тази мрежа."
                  : undefined
              }
            />
          </Fields>
        ) : (
          <EmptyNote source={rdap ?? emptySource()} />
        )}
        {rdap?.data?.remarks.length ? (
          <div className="mt-4 space-y-1 text-xs text-text-faint">
            {rdap.data.remarks.map((remark) => (
              <p key={remark}>{remark}</p>
            ))}
          </div>
        ) : null}
      </Card>

      <Card
        title="Автономна система"
        hint="Кой оператор реално обявява адреса в глобалната маршрутизация в момента."
        source={origin}
      >
        {origin?.data ? (
          <Fields>
            <Field label="Номер" value={`AS${origin.data.asn}`} />
            <Field label="Име" value={origin.data.asName} mono={false} />
            <Field label="Обявен префикс" value={origin.data.prefix} />
            <Field label="Регистър" value={origin.data.registry?.toUpperCase()} />
            <Field label="Разпределен на" value={origin.data.allocated} />
          </Fields>
        ) : (
          <EmptyNote source={origin ?? emptySource()} />
        )}
      </Card>

      <Card title="Местоположение" source={geofeed}>
        {country ? (
          <>
            <p className="mb-2">
              <Badge tone={country.confidence === "high" ? "ok" : "neutral"}>{country.code}</Badge>
            </p>
            <p className="text-sm text-text-muted">
              Основание: {country.basis}.{" "}
              {country.confidence === "high"
                ? "Това е най-достоверният вид геоданни — обявени са от самия оператор."
                : "Стойността е груба и може да не съвпада с реалното местоположение на устройството."}
            </p>
          </>
        ) : (
          <p className="text-sm text-text-muted">Няма достатъчно основание да посочим държава.</p>
        )}

        {geofeed?.data ? (
          <Fields>
            <Field label="Префикс в geofeed" value={geofeed.data.prefix} />
            <Field label="Регион" value={geofeed.data.region} />
            <Field label="Град" value={geofeed.data.city} mono={false} />
            <Field label="Пощенски код" value={geofeed.data.postalCode} />
          </Fields>
        ) : (
          <p className="mt-3">
            <EmptyNote source={geofeed ?? emptySource()} />
          </p>
        )}

        {/* Офлайн гео базата. Показва се СЛЕД geofeed-а, защото е предположение
            на трета страна, а geofeed-ът е твърдение на самия оператор. */}
        {geoip ? (
          <div className="mt-4 border-t border-border pt-4">
            <p className="card-title mb-2">Офлайн гео база</p>
            {geoip.data ? (
              <>
                <Fields>
                  <Field label="Държава" value={geoip.data.country} />
                  <Field
                    label="Град"
                    value={geoip.data.city}
                    mono={false}
                    note="Предположение на базата данни, не факт. Кварталът се маха нарочно — базата няма откъде да го знае."
                  />
                  <Field
                    label="Медианна грешка"
                    value={`≈ ${geoip.data.medianErrorKm} км`}
                    note="Измерена спрямо реални координати от оператори (RIPE Atlas и UNICEF Giga, 37 302 наблюдения)."
                  />
                </Fields>
                {geoip.data.limitedBecause ? (
                  <p className="mt-3 rounded-lg border border-warn p-3 text-sm text-text-muted">
                    {geoip.data.limitedBecause}
                  </p>
                ) : null}
              </>
            ) : (
              <EmptyNote source={geoip} />
            )}
          </div>
        ) : null}

        {country ? <CountryLocation code={country.code} /> : null}
      </Card>

      <Card title="Тип на адреса" source={provider}>
        {provider?.data ? (
          <>
            <p className="mb-3">
              <Badge tone={provider.data.kind === "relay" ? "info" : "neutral"}>
                {provider.data.provider}
              </Badge>
            </p>
            <Fields>
              <Field label="Регион/зона" value={provider.data.region} />
              <Field label="Услуга" value={provider.data.service} />
              <Field label="Обявен град" value={provider.data.city} mono={false} />
            </Fields>
            <p className="mt-3 text-sm text-text-muted">{provider.data.meaning}</p>
          </>
        ) : (
          <EmptyNote source={provider ?? emptySource()} />
        )}
      </Card>

      <Card
        title="Обратен DNS"
        hint="PTR записът се задава от собственика на адреса и сам по себе си не доказва нищо — затова го проверяваме и в обратната посока."
        source={ptr}
      >
        {ptr?.data ? (
          <>
            <p className="mb-3">
              <Badge tone={ptr.data.forwardConfirmed ? "ok" : "warn"}>
                {ptr.data.forwardConfirmed ? "Потвърдено в двете посоки" : "Непотвърдено"}
              </Badge>
            </p>
            <Fields>
              <Field label="PTR имена" value={ptr.data.names.join(", ")} />
              <Field
                label="Потвърдени"
                value={ptr.data.confirmed.join(", ")}
                note="Тези имена се резолвват обратно точно до този адрес (FCrDNS)."
              />
            </Fields>
          </>
        ) : (
          <EmptyNote source={ptr ?? emptySource()} />
        )}
      </Card>

      {reputation?.data ? (
        <Card title="Проверени списъци" source={reputation}>
          <p className="text-sm text-text-muted">
            Проверени: {reputation.data.checked.join(", ")}.
            {reputation.data.unavailable.length > 0 ? (
              <>
                {" "}
                Недостъпни в момента: {reputation.data.unavailable.join(", ")} — затова „няма попадение“ е
                непълно твърдение.
              </>
            ) : null}
          </p>
          {reputation.data.hits.length === 0 ? (
            <p className="mt-2 text-sm text-text-faint">
              Няма попадение в проверените списъци. Това означава само, че тези списъци не познават
              адреса — не е удостоверение за добро поведение.
            </p>
          ) : null}
        </Card>
      ) : null}

      {/* Каква следа остави самата справка. Първото нещо, което разследващият
          трябва да види — не последното. */}
      {isInvestigationMode() ? <OpsecNotice report={report} /> : null}

      {caseContext && can(caseContext.session.role, "freeze") ? (
        <Card title="Замразяване за преписка">
          <FreezeButton ip={ip.normalized} />
        </Card>
      ) : null}

      {/* Следствената справка е САМО за вътрешното издание. В публичния режим
          не се рендира изобщо — не е скрита с CSS, а изобщо не съществува в
          отговора. */}
      {isInvestigationMode() ? (
        <Card
          title="Следствена справка"
          hint="Подготвя искането до оператора. Инструментът не локализира — той прави искането пълно, за да не се върне празно."
        >
          <CaseBrief ip={ip} report={report} />
        </Card>
      ) : null}

      {capabilities().activeProbe && (!caseContext || can(caseContext.session.role, "probe")) ? (
        <Card
          title="Активна проверка"
          hint="Всичко по-горе е справка в регистри. Това под тук се свързва с адреса и отсрещната страна го вижда."
        >
          <ActiveProbe ip={ip.normalized} />
        </Card>
      ) : null}

      <p className="text-xs text-text-faint">Справката отне {report.totalMs} ms.</p>
    </div>
  );
}

// ── Помощни изгледи ───────────────────────────────────────────────────────

/**
 * Картата и координатите на държавата.
 *
 * Координатите СЪЩЕСТВУВАТ, но са на географския център на държавата — и точно
 * така са надписани. Разликата с останалите инструменти не е дали показваме
 * число, а дали казваме на какво е число.
 */
function CountryLocation({ code }: { code: string }) {
  const centre = countryCentre(code);
  return (
    <>
      <WorldMap code={code} label={code} />
      {centre ? (
        <Fields>
          <Field
            label="Център на държавата"
            value={formatCoordinates(centre.lat, centre.lon)}
            note="Географският център на държавата, изчислен от очертанията ѝ. НЕ е местоположение на адреса и не бива да се ползва като такова."
          />
        </Fields>
      ) : null}
      <p className="mt-3 text-xs text-text-faint">
        Точността по град при геолокация по IP е около 66% „в рамките на 50 км“, затова тук няма игличка
        върху град. Един центроид по подразбиране навремето прати стотици милиони адреса към една ферма в
        Канзас — грешка, която не повтаряме.
      </p>
    </>
  );
}

/**
 * Оперативната следа на справката.
 *
 * Всяка жива заявка казва на някого, че този адрес е бил проверен. При
 * разследване това не е дребна подробност — регистрите са извън ЕС и логват, а
 * geofeed заявката отива право при оператора на проверявания. Затова тук се
 * изброява какво точно е напуснало сървъра, вместо да се предполага, че
 * потребителят знае как работи вътрешността.
 */
function OpsecNotice({ report }: { report: LookupReport }) {
  const allowed = capabilities();
  const live: string[] = [];
  if (report.rdap?.status !== "empty" && report.rdap?.ms) {
    live.push(`${report.rdap.source} — регистърът вижда, че адресът е проверен, и логва заявката`);
  }
  if (report.origin?.ms) live.push(`${report.origin.source} — DNS заявка към трета страна`);
  if (report.ptr?.ms) live.push(`${report.ptr.source} — DNS заявка, обикновено към зоната на оператора`);
  if (allowed.geofeed && report.geofeed?.ms) {
    live.push(`${report.geofeed.source} — заявката отиде ПРЯКО на сървъра на оператора`);
  }

  return (
    <Card title="Оперативна следа на тази справка">
      <ul className="space-y-1.5 text-sm text-text-muted">
        {live.map((entry) => (
          <li key={entry}>· {entry}</li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-text-muted">
        Списъците с диапазони и репутация са изтеглени наведнъж и се четат локално — те не издават
        конкретния адрес.
      </p>
      {!allowed.geofeed || !allowed.activeProbe ? (
        <p className="mt-3 text-sm text-ok">
          <span aria-hidden="true">✔</span> Изключени в този режим:{" "}
          {[!allowed.geofeed ? "geofeed" : null, !allowed.activeProbe ? "активна проверка" : null]
            .filter(Boolean)
            .join(", ")}{" "}
          — двете щяха да уведомят съответно оператора и самата цел.
        </p>
      ) : null}
      <p className="mt-3 text-xs text-text-faint">
        Справките към регистрите напускат ЕС (ARIN, APNIC). Ако това е недопустимо за конкретното
        производство, работи само с локалния анализ.
      </p>
    </Card>
  );
}

function NetworkSkeleton() {
  return (
    <div className="space-y-6" aria-live="polite" aria-busy="true">
      <p className="sr-only">Външните източници се проверяват…</p>
      {[0, 1, 2].map((index) => (
        <div key={index} className="card p-5">
          <div className="skeleton h-4 w-40" />
          <div className="mt-4 space-y-2">
            <div className="skeleton h-3 w-full" />
            <div className="skeleton h-3 w-5/6" />
            <div className="skeleton h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

function InvalidAddress({ raw }: { raw: string }) {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-text">Това не е валиден IP адрес</h1>
      <p className="text-text-muted">
        Не успяхме да разчетем <span className="value-mono">{raw.slice(0, 80)}</span> като IPv4 или IPv6
        адрес.
      </p>
      <Card title="Опитай пак">
        <SearchForm autoFocus />
      </Card>
      <p className="text-sm text-text-faint">
        <Link href="/" className="text-accent underline underline-offset-2">
          Обратно към началото
        </Link>
      </p>
    </div>
  );
}

function rangeText(start?: string, end?: string): string | undefined {
  return start && end ? `${start} – ${end}` : (start ?? end);
}

function formatDate(value?: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString().slice(0, 10);
}

/** Заместител, когато източникът изобщо не е бил стартиран. */
function emptySource() {
  return {
    status: "empty" as const,
    source: "—",
    sourceUrl: "https://iplookup.carbonstealth.eu",
    ms: 0,
  };
}
