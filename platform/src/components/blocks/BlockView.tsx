import type { Block, Align } from "@/lib/blocks";
import { renderInline } from "@/lib/blocks";
import { HeroBackdrop } from "./HeroBackdrop";

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
export function BlockRender({ block }: { block: Block }) {
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
      const style =
        block.variant === "primary"
          ? "bg-brand-600 text-white shadow-lg shadow-brand-600/25 hover:bg-brand-500 hover:shadow-xl hover:shadow-brand-600/30"
          : "border border-slate-300 bg-white/60 text-slate-700 backdrop-blur hover:border-slate-400 hover:bg-white";
      return (
        <div className={`flex ${justifyCls[block.align]}`}>
          <a
            href={block.href}
            target="_blank"
            rel="noreferrer"
            className={`pub-btn group inline-flex items-center gap-1.5 rounded-xl px-6 py-3 text-sm font-semibold tracking-wide ${style}`}
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
          className={`relative isolate overflow-hidden rounded-3xl bg-gradient-to-br from-brand-700 via-brand-600 to-brand-900 px-6 py-20 text-white shadow-2xl shadow-brand-900/25 sm:px-12 sm:py-24 ${alignCls[block.align]}`}
        >
          <HeroBackdrop />
          <div className={`relative flex flex-col ${itemsCls[block.align]}`}>
            <h2 className="pub-display max-w-2xl text-balance text-4xl font-semibold leading-[1.05] drop-shadow-sm sm:text-5xl md:text-6xl">
              {block.title}
            </h2>
            {block.subtitle && (
              <p className="pub-body mt-5 max-w-xl text-lg leading-relaxed text-brand-100/95 sm:text-xl">
                {block.subtitle}
              </p>
            )}
            {block.buttonHref && block.buttonLabel && (
              <div className={`mt-9 flex ${justifyCls[block.align]}`}>
                <a
                  href={block.buttonHref}
                  target="_blank"
                  rel="noreferrer"
                  className="pub-btn group inline-flex items-center gap-1.5 rounded-xl bg-white px-7 py-3.5 text-sm font-semibold tracking-wide text-brand-700 shadow-lg shadow-brand-950/20 hover:bg-brand-50"
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
    case "divider":
      return (
        <hr className="mx-auto h-px w-full max-w-[8rem] border-0 bg-gradient-to-r from-transparent via-slate-300 to-transparent" />
      );
    case "spacer":
      return <div className={block.size === "sm" ? "h-4" : block.size === "lg" ? "h-20" : "h-10"} />;
  }
}

// Рендира цялата страница (списък блокове) в светла тема — реалният сайт.
export function BlockView({ blocks }: { blocks: Block[] }) {
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
          <BlockRender block={b} />
        </div>
      ))}
    </div>
  );
}
