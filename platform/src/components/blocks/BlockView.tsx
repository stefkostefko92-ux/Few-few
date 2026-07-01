import type { Block, Align } from "@/lib/blocks";
import { renderInline } from "@/lib/blocks";

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

// Рендира един блок в реалния (публичен) вид на страницата.
export function BlockRender({ block }: { block: Block }) {
  switch (block.type) {
    case "heading": {
      const cls = `font-bold text-slate-900 ${alignCls[block.align]} ${block.level === 1 ? "text-4xl" : block.level === 2 ? "text-2xl" : "text-xl"}`;
      const html = { __html: renderInline(block.text) };
      if (block.level === 1) return <h1 className={cls} dangerouslySetInnerHTML={html} />;
      if (block.level === 2) return <h2 className={cls} dangerouslySetInnerHTML={html} />;
      return <h3 className={cls} dangerouslySetInnerHTML={html} />;
    }
    case "text":
      return (
        <p
          className={`leading-relaxed text-slate-700 ${alignCls[block.align]}`}
          dangerouslySetInnerHTML={{ __html: renderInline(block.text) }}
        />
      );
    case "image":
      if (!block.url) return null;
      return (
        <div className={`flex ${justifyCls[block.align]}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={block.url}
            alt={block.alt}
            className={`max-w-full ${block.rounded ? "rounded-xl" : ""}`}
          />
        </div>
      );
    case "button": {
      if (!block.href) return null;
      const style =
        block.variant === "primary"
          ? "bg-brand-600 text-white hover:bg-brand-500"
          : "border border-slate-300 text-slate-700 hover:bg-slate-100";
      return (
        <div className={`flex ${justifyCls[block.align]}`}>
          <a
            href={block.href}
            target="_blank"
            rel="noreferrer"
            className={`inline-flex rounded-md px-5 py-2.5 text-sm font-medium ${style}`}
          >
            {block.label}
          </a>
        </div>
      );
    }
    case "hero":
      return (
        <div className={`rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 px-6 py-16 text-white ${alignCls[block.align]}`}>
          <h2 className="text-3xl font-bold sm:text-4xl">{block.title}</h2>
          {block.subtitle && <p className="mt-3 text-lg text-brand-100">{block.subtitle}</p>}
          {block.buttonHref && block.buttonLabel && (
            <div className={`mt-6 flex ${justifyCls[block.align]}`}>
              <a
                href={block.buttonHref}
                target="_blank"
                rel="noreferrer"
                className="inline-flex rounded-md bg-white px-5 py-2.5 text-sm font-semibold text-brand-700 hover:bg-brand-50"
              >
                {block.buttonLabel}
              </a>
            </div>
          )}
        </div>
      );
    case "gallery":
      if (block.images.length === 0) return null;
      return (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {block.images.map((img, i) =>
            img.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={img.url} alt={img.alt} className="h-40 w-full rounded-lg object-cover" />
            ) : null,
          )}
        </div>
      );
    case "divider":
      return <hr className="border-slate-200" />;
    case "spacer":
      return <div className={block.size === "sm" ? "h-4" : block.size === "lg" ? "h-16" : "h-8"} />;
  }
}

// Рендира цялата страница (списък блокове) в светла тема — реалният сайт.
export function BlockView({ blocks }: { blocks: Block[] }) {
  if (blocks.length === 0) {
    return <p className="text-center text-slate-400">Празна страница.</p>;
  }
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10">
      {blocks.map((b) => (
        <BlockRender key={b.id} block={b} />
      ))}
    </div>
  );
}
