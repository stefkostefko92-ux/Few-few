import { AlertTriangle, Info, Phone, Globe } from "@/components/icons";

// Списък с източници под съдържание — за прозрачност и доверие.
export function Sources({ items }: { items: { label: string; url: string }[] }) {
  if (!items.length) return null;
  return (
    <div className="mt-8 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
      <p className="font-semibold text-slate-700">Източници</p>
      <ul className="mt-2 space-y-1">
        {items.map((s) => (
          <li key={s.url}>
            <a
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-700 underline underline-offset-2 hover:text-brand-800"
            >
              {s.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

type Tone = "info" | "warning" | "danger";

const TONE: Record<Tone, { box: string; icon: string }> = {
  info: { box: "border-gold-300 bg-gold-50", icon: "text-gold-600" },
  warning: { box: "border-gold-300 bg-gold-50", icon: "text-gold-600" },
  danger: { box: "border-red-200 bg-red-50", icon: "text-red-700" },
};

// Подчертана кутия със съвет/предупреждение.
export function Callout({
  tone = "info",
  children,
}: {
  tone?: Tone;
  children: React.ReactNode;
}) {
  const t = TONE[tone];
  const Icon = tone === "danger" ? AlertTriangle : Info;
  return (
    <div className={`my-6 flex items-start gap-3 rounded-xl border p-4 ${t.box}`}>
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${t.icon}`} aria-hidden />
      <div className="text-base text-slate-700">{children}</div>
    </div>
  );
}

// Карта за външен ресурс (онлайн справка, портал, телефон).
export function ResourceCard({
  title,
  text,
  href,
  hrefLabel,
  phone,
}: {
  title: string;
  text?: string;
  href?: string;
  hrefLabel?: string;
  phone?: string;
}) {
  return (
    <article className="card">
      <h3 className="font-display text-lg font-bold text-slate-900">{title}</h3>
      {text && <p className="mt-2 text-base text-slate-600">{text}</p>}
      {phone && (
        <a
          href={"tel:" + phone.replace(/\s+/g, "")}
          className="mt-3 inline-flex items-center gap-2 text-lg font-semibold text-brand-700 hover:underline"
        >
          <Phone className="h-5 w-5" aria-hidden />
          {phone}
        </a>
      )}
      {href && (
        <p className="mt-3">
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-base font-medium text-brand-700 hover:underline"
          >
            <Globe className="h-5 w-5" aria-hidden />
            {hrefLabel ?? "Отвори"}
          </a>
        </p>
      )}
    </article>
  );
}

// Списък въпроси/отговори (визуален; JSON-LD се добавя отделно на страницата).
export function FaqList({
  items,
}: {
  items: { q: string; a: React.ReactNode }[];
}) {
  return (
    <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
      {items.map((it, i) => (
        <details key={i} className="group p-4 sm:p-5">
          <summary className="cursor-pointer list-none font-display text-lg font-semibold text-slate-900 marker:hidden">
            {it.q}
          </summary>
          <div className="mt-2 text-base text-slate-700">{it.a}</div>
        </details>
      ))}
    </div>
  );
}
