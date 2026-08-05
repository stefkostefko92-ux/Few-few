import type { Metadata } from "next";

import { ADDRESS_ONE_LINE, PUBLISHER, SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Импресум",
  description: "Данни за издателя на Карбон IP — Carbon Stealth VCC, ЕИК 208725180.",
  alternates: { canonical: "/impresum" },
};

export default function ImprintPage() {
  return (
    <article className="max-w-3xl space-y-6">
      <h1 className="text-3xl font-bold text-text">Импресум</h1>
      <p className="text-text-muted">Данни за доставчика на услугата {SITE_NAME}.</p>

      <dl className="card divide-y divide-border p-5">
        <Row label="Наименование" value={PUBLISHER.legalName} />
        <Row label="ЕИК" value={PUBLISHER.eik} />
        <Row label="ДДС номер" value={PUBLISHER.vat} />
        <Row label="Адрес" value={ADDRESS_ONE_LINE} />
        <Row label="Телефон" value={PUBLISHER.phone} />
        <Row label="Имейл" value={PUBLISHER.emailGeneral} />
        <Row label="Поверителност" value={PUBLISHER.email} />
        <Row label="Уебсайт" value={PUBLISHER.url} />
      </dl>
    </article>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="py-3 sm:grid sm:grid-cols-[12rem_1fr] sm:gap-4">
      <dt className="text-sm text-text-muted">{label}</dt>
      <dd className="text-sm text-text">{value}</dd>
    </div>
  );
}
