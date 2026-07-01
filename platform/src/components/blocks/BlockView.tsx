import type { Block, Align } from "@/lib/blocks";
import { renderInline, videoEmbedSrc, mapEmbedSrc } from "@/lib/blocks";
import { HeroBackdrop } from "./HeroBackdrop";
import { SiteContactForm } from "./SiteContactForm";

const alignCls: Record<Align, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};
const justifyCls: Record<Align, string> = {
  left: "justify-start",
  center: "justify-center",
  right: "justify-end",
};
const itemsCls: Record<Align, string> = {
  left: "items-start",
  center: "items-center",
  right: "items-end",
};

// Рендира един блок в реалния (публичен) вид на страницата.
export function BlockRender({
  block,
  siteSlug,
  locale = "bg",
}: {
  block: Block;
  siteSlug?: string;
  locale?: "bg" | "en" | "it";
}) {
  switch (block.type) {
    case "heading": {
      // H1 и H2 получават изящен serif display; H3 остава чист sans за йерархия.
      const html = { __html: renderInline(block.text) };
      if (block.level === 1)
        return (
          <h1
            className={`pub-display text-balance text-4xl font-semibold leading-[1.08] text-slate-900 sm:text-5xl ${alignCls[block.align]}`}
            dangerouslySetInnerHTML={html}
          />
        );
      if (block.level === 2)
        return (
          <h2
            className={`pub-display text-3xl font-semibold leading-tight text-slate-900 ${alignCls[block.align]}`}
            dangerouslySetInnerHTML={html}
          />
        );
      return (
        <h3
          className={`text-lg font-semibold uppercase tracking-wide text-slate-500 ${alignCls[block.align]}`}
          dangerouslySetInnerHTML={html}
        />
      );
    }
    case "text":
      return (
        <p
          className={`pub-body text-[1.075rem] leading-[1.75] text-slate-600 ${alignCls[block.align]}`}
          dangerouslySetInnerHTML={{ __html: renderInline(block.text) }}
        />
      );
    case "image":
      if (!block.url) return null;
      return (
        <figure className={`flex ${justifyCls[block.align]}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={block.url}
            alt={block.alt}
            loading="lazy"
            className={`max-w-full shadow-sm ring-1 ring-slate-900/5 ${
              block.rounded ? "rounded-2xl" : "rounded-sm"
            }`}
          />
        </figure>
      );
    case "button": {
      if (!block.href) return null;
      const isPrimary = block.variant === "primary";
      const cls = isPrimary
        ? "text-[color:var(--pub-accent-text)] shadow-lg hover:opacity-90"
        : "border border-slate-300 bg-white/60 text-slate-700 backdrop-blur hover:border-slate-400 hover:bg-white";
      return (
        <div className={`flex ${justifyCls[block.align]}`}>
          <a
            href={block.href}
            target="_blank"
            rel="noreferrer"
            style={isPrimary ? { backgroundColor: "var(--pub-accent, #4f46e5)" } : undefined}
            className={`pub-btn group inline-flex items-center gap-1.5 rounded-xl px-6 py-3 text-sm font-semibold tracking-wide ${cls}`}
          >
            {block.label}
            <span
              aria-hidden
              className="transition-transform duration-300 group-hover:translate-x-0.5"
            >
              →
            </span>
          </a>
        </div>
      );
    }
    case "hero":
      return (
        <div
          style={{
            backgroundImage:
              "linear-gradient(135deg, var(--pub-accent, #4f46e5) 0%, var(--pub-accent-dark, #3730a3) 100%)",
          }}
          className={`relative isolate overflow-hidden rounded-3xl px-6 py-20 text-white shadow-2xl sm:px-12 sm:py-24 ${alignCls[block.align]}`}
        >
          <HeroBackdrop />
          <div className={`relative flex flex-col ${itemsCls[block.align]}`}>
            <h2 className="pub-display max-w-2xl text-balance text-4xl font-semibold leading-[1.05] drop-shadow-sm sm:text-5xl md:text-6xl">
              {block.title}
            </h2>
            {block.subtitle && (
              <p className="pub-body mt-5 max-w-xl text-lg leading-relaxed text-white/90 sm:text-xl">
                {block.subtitle}
              </p>
            )}
            {block.buttonHref && block.buttonLabel && (
              <div className={`mt-9 flex ${justifyCls[block.align]}`}>
                <a
                  href={block.buttonHref}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "var(--pub-accent, #4f46e5)" }}
                  className="pub-btn group inline-flex items-center gap-1.5 rounded-xl bg-white px-7 py-3.5 text-sm font-semibold tracking-wide shadow-lg shadow-black/20 hover:bg-slate-50"
                >
                  {block.buttonLabel}
                  <span
                    aria-hidden
                    className="transition-transform duration-300 group-hover:translate-x-0.5"
                  >
                    →
                  </span>
                </a>
              </div>
            )}
          </div>
        </div>
      );
    case "gallery":
      if (block.images.length === 0) return null;
      return (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
          {block.images.map((img, i) =>
            img.url ? (
              <figure
                key={i}
                className="pub-tile group relative rounded-2xl bg-slate-100 shadow-sm ring-1 ring-slate-900/5"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.url}
                  alt={img.alt}
                  loading="lazy"
                  className="h-44 w-full rounded-2xl object-cover"
                />
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-t from-slate-900/25 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                />
              </figure>
            ) : null,
          )}
        </div>
      );
    case "columns":
      return (
        <div className="grid gap-8 sm:grid-cols-2">
          <div
            className="pub-body leading-[1.75] text-slate-600"
            dangerouslySetInnerHTML={{ __html: renderInline(block.left) }}
          />
          <div
            className="pub-body leading-[1.75] text-slate-600"
            dangerouslySetInnerHTML={{ __html: renderInline(block.right) }}
          />
        </div>
      );
    case "columns3":
      return (
        <div className="grid gap-6 sm:grid-cols-3">
          {[block.col1, block.col2, block.col3].map((c, i) => (
            <div
              key={i}
              className="pub-body leading-[1.7] text-slate-600"
              dangerouslySetInnerHTML={{ __html: renderInline(c) }}
            />
          ))}
        </div>
      );
    case "cta":
      return (
        <div
          style={{ backgroundImage: "linear-gradient(135deg, var(--pub-accent, #4f46e5) 0%, var(--pub-accent-dark, #3730a3) 100%)" }}
          className="flex flex-col items-center gap-4 rounded-3xl px-6 py-12 text-center text-white shadow-xl sm:px-12"
        >
          <h2 className="pub-display text-3xl font-semibold">{block.title}</h2>
          {block.subtitle && <p className="pub-body max-w-xl text-white/90">{block.subtitle}</p>}
          {block.buttonHref && block.buttonLabel && (
            <a
              href={block.buttonHref}
              target="_blank"
              rel="noreferrer"
              style={{ color: "var(--pub-accent, #4f46e5)" }}
              className="pub-btn mt-2 inline-flex items-center rounded-xl bg-white px-7 py-3 text-sm font-semibold shadow-lg hover:bg-slate-50"
            >
              {block.buttonLabel}
            </a>
          )}
        </div>
      );
    case "stats":
      if (block.items.length === 0) return null;
      return (
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
          {block.items.map((s, i) => (
            <div key={i} className="text-center">
              <div style={{ color: "var(--pub-accent, #4f46e5)" }} className="pub-display text-4xl font-bold">
                {s.value}
              </div>
              <div className="mt-1 text-sm text-slate-500">{s.label}</div>
            </div>
          ))}
        </div>
      );
    case "socials": {
      const shown = block.links.filter((l) => l.url);
      if (shown.length === 0) return null;
      const LABELS: Record<string, string> = {
        facebook: "Facebook", instagram: "Instagram", x: "X", twitter: "X",
        youtube: "YouTube", linkedin: "LinkedIn", tiktok: "TikTok", telegram: "Telegram",
      };
      return (
        <div className="flex flex-wrap justify-center gap-3">
          {shown.map((l, i) => (
            <a
              key={i}
              href={l.url}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
            >
              {LABELS[l.platform.toLowerCase()] ?? l.platform}
            </a>
          ))}
        </div>
      );
    }
    case "faq":
      if (block.items.length === 0) return null;
      return (
        <div className="mx-auto w-full max-w-2xl divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
          {block.items.map((it, i) => (
            <details key={i} className="group px-5 py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between text-base font-semibold text-slate-800">
                {it.q}
                <span aria-hidden className="ml-3 text-slate-400 transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p
                className="pub-body mt-2 leading-relaxed text-slate-600"
                dangerouslySetInnerHTML={{ __html: renderInline(it.a) }}
              />
            </details>
          ))}
        </div>
      );
    case "testimonials":
      if (block.items.length === 0) return null;
      return (
        <div className="grid gap-4 sm:grid-cols-2">
          {block.items.map((t, i) => (
            <figure key={i} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <blockquote className="pub-body text-slate-700">„{t.quote}“</blockquote>
              <figcaption className="mt-4 text-sm">
                <span className="font-semibold text-slate-900">{t.author}</span>
                {t.role && <span className="text-slate-500"> · {t.role}</span>}
              </figcaption>
            </figure>
          ))}
        </div>
      );
    case "pricing":
      if (block.plans.length === 0) return null;
      return (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {block.plans.map((p, i) => (
            <div key={i} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-900">{p.name}</h3>
              <p className="mt-2">
                <span className="text-3xl font-bold text-slate-900">{p.price}</span>
                <span className="text-slate-500">{p.period}</span>
              </p>
              <ul className="mt-4 flex-1 space-y-2 text-sm text-slate-600">
                {p.features.map((f, j) => (
                  <li key={j} className="flex gap-2">
                    <span aria-hidden style={{ color: "var(--pub-accent, #4f46e5)" }}>✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              {p.href && (
                <a
                  href={p.href}
                  target="_blank"
                  rel="noreferrer"
                  style={{ backgroundColor: "var(--pub-accent, #4f46e5)", color: "var(--pub-accent-text, #fff)" }}
                  className="pub-btn mt-5 inline-flex justify-center rounded-xl px-5 py-2.5 text-sm font-semibold hover:opacity-90"
                >
                  Избери
                </a>
              )}
            </div>
          ))}
        </div>
      );
    case "video": {
      const src = videoEmbedSrc(block.url);
      if (!src) return null;
      return (
        <div className="aspect-video w-full overflow-hidden rounded-2xl bg-slate-900 shadow-lg">
          <iframe
            src={src}
            title="Видео"
            className="h-full w-full"
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      );
    }
    case "map": {
      const mapSrc = mapEmbedSrc(block.url);
      if (!mapSrc) return null;
      return (
        <div className="h-80 w-full overflow-hidden rounded-2xl border border-slate-200 shadow-sm">
          <iframe
            src={mapSrc}
            title="Карта"
            className="h-full w-full"
            loading="lazy"
          />
        </div>
      );
    }
    case "form":
      return (
        <SiteContactForm
          siteSlug={siteSlug}
          title={block.title}
          buttonLabel={block.buttonLabel}
          successMessage={block.successMessage}
          locale={locale}
        />
      );
    case "divider":
      return (
        <hr className="mx-auto h-px w-full max-w-[8rem] border-0 bg-gradient-to-r from-transparent via-slate-300 to-transparent" />
      );
    case "spacer":
      return <div className={block.size === "sm" ? "h-4" : block.size === "lg" ? "h-20" : "h-10"} />;
  }
}

// Рендира цялата страница (списък блокове) в светла тема — реалният сайт.
// siteSlug е нужен на формата за контакт, за да знае къде да прати заявката.
export function BlockView({
  blocks,
  siteSlug,
  locale = "bg",
}: {
  blocks: Block[];
  siteSlug?: string;
  locale?: "bg" | "en" | "it";
}) {
  if (blocks.length === 0) {
    return <p className="py-20 text-center text-slate-400">Празна страница.</p>;
  }
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-7 px-5 py-14 sm:py-20">
      {blocks.map((b, i) => (
        <div
          key={b.id}
          className="pub-reveal"
          style={{ animationDelay: `${Math.min(i, 8) * 70}ms` }}
        >
          <BlockRender block={b} siteSlug={siteSlug} locale={locale} />
        </div>
      ))}
    </div>
  );
}
