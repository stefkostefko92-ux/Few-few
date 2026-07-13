import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ENTERPRISES, getEnterprise } from "@/data/enterprises";
import { sector as getSector } from "@/data/sectors";
import { principal as getPrincipal } from "@/data/principals";
import { PageHero, Section, Badge, ExternalLink } from "@/components/ui";
import { MoneyFlowColumn } from "@/components/MoneyFlows";
import { JsonLd } from "@/components/JsonLd";
import { buildMetadata, breadcrumbLd, canonical } from "@/lib/seo";
import {
  Building,
  ShieldCheck,
  Info,
  Link as LinkIcon,
  External,
} from "@/components/icons";

export function generateStaticParams() {
  return ENTERPRISES.map((e) => ({ slug: e.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const e = getEnterprise(slug);
  if (!e) return buildMetadata({ title: "Не е намерено", description: "", path: "/predpriyatiya" });
  return buildMetadata({
    title: e.name,
    description: `${e.activity} Как влизат и излизат парите на ${e.shortName ?? e.name}.`,
    path: `/predpriyatiya/${e.slug}`,
  });
}

export default async function EnterprisePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const e = getEnterprise(slug);
  if (!e) notFound();

  const sec = getSector(e.sector);
  const prin = getPrincipal(e.principal);

  const orgLd = {
    "@context": "https://schema.org",
    "@type": "GovernmentOrganization",
    name: e.name,
    url: e.website ?? canonical(`/predpriyatiya/${e.slug}`),
    description: e.activity,
    ...(e.hq ? { location: { "@type": "Place", name: e.hq } } : {}),
    ...(e.eik ? { identifier: e.eik } : {}),
  };

  return (
    <>
      <JsonLd
        data={[
          breadcrumbLd([
            { name: "Начало", path: "/" },
            { name: "Предприятия", path: "/predpriyatiya" },
            { name: e.shortName ?? e.name, path: `/predpriyatiya/${e.slug}` },
          ]),
          orgLd,
        ]}
      />

      <PageHero
        eyebrow={sec.name}
        title={e.name}
        intro={e.activity}
        crumbs={[
          { name: "Предприятия", path: "/predpriyatiya" },
          { name: e.shortName ?? e.name, path: `/predpriyatiya/${e.slug}` },
        ]}
      />

      <div className="container-content space-y-12 py-10">
        {/* Профил */}
        <Section
          title="Профил"
          icon={<Building className="h-6 w-6 text-brand-700" aria-hidden />}
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Fact label="Правна форма" value={e.legalForm} />
            <Fact label="Държавно участие" value={`${e.stateShare}%`} />
            <Fact label="Сектор" value={sec.name} />
            <Fact label="Принципал" value={prin.name} />
            {e.parent && <Fact label="Дружество-майка" value={e.parent} />}
            {e.hq && <Fact label="Седалище" value={e.hq} />}
            {e.eik && <Fact label="ЕИК" value={e.eik} />}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Badge tone="brand">{sec.short}</Badge>
            <Badge>{e.legalForm}</Badge>
            {e.stateShare === 100 && <Badge>100% държавно</Badge>}
            {e.website && (
              <ExternalLink href={e.website}>Официален сайт</ExternalLink>
            )}
          </div>
          <p className="mt-4 max-w-3xl text-slate-600">
            <span className="font-semibold text-slate-900">Роля: </span>
            {e.role}
          </p>
        </Section>

        {/* Паричните потоци */}
        <Section title="Как влизат и излизат парите">
          <div className="grid gap-5 md:grid-cols-2">
            <MoneyFlowColumn kind="in" flows={e.moneyIn} />
            <MoneyFlowColumn kind="out" flows={e.moneyOut} />
          </div>
          {e.financial && (
            <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-sm text-slate-500">
                Ориентировъчно ({e.financial.year})
              </p>
              <p className="mt-1 text-slate-800">{e.financial.text}</p>
              {e.financial.source && (
                <p className="mt-1 text-sm">
                  <ExternalLink href={e.financial.source.url}>
                    {e.financial.source.label}
                  </ExternalLink>
                </p>
              )}
            </div>
          )}
        </Section>

        {/* Контрол и надзор */}
        <Section
          title="Контрол и надзор"
          icon={<ShieldCheck className="h-6 w-6 text-brand-700" aria-hidden />}
        >
          <ul className="grid gap-2 sm:grid-cols-2">
            {e.oversight.map((o, i) => (
              <li
                key={i}
                className="rounded-lg border border-slate-200 bg-white p-3 text-slate-700"
              >
                {o}
              </li>
            ))}
          </ul>
        </Section>

        {/* Бележки за прозрачност */}
        {e.notes && e.notes.length > 0 && (
          <Section
            title="Важно за прозрачността"
            icon={<Info className="h-6 w-6 text-brand-700" aria-hidden />}
          >
            <ul className="space-y-2">
              {e.notes.map((n, i) => (
                <li
                  key={i}
                  className="rounded-lg border-l-4 border-outflow-400 bg-outflow-50 p-3 text-slate-700"
                >
                  {n}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Източници */}
        <Section
          title="Провери в официалните източници"
          icon={<LinkIcon className="h-6 w-6 text-brand-700" aria-hidden />}
        >
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
            {e.sources.map((s, i) => (
              <li key={i}>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between gap-3 p-4 hover:bg-brand-50"
                >
                  <span className="font-medium text-slate-800">{s.label}</span>
                  <External className="h-4 w-4 shrink-0 text-brand-700" aria-hidden />
                </a>
              </li>
            ))}
          </ul>
        </Section>

        <div>
          <Link href="/predpriyatiya" className="btn-secondary">
            ← Всички предприятия
          </Link>
        </div>
      </div>
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 font-semibold text-slate-900">{value}</p>
    </div>
  );
}
