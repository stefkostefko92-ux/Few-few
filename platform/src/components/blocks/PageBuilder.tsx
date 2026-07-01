"use client";

import { useState, useTransition, useRef } from "react";
import {
  type Block,
  type BlockType,
  makeBlock,
  BLOCK_LABELS,
} from "@/lib/blocks";
import { BlockRender } from "@/components/blocks/BlockView";
import type { PageActionResult } from "@/app/dashboard/sites/[slug]/pages/actions";
import { Inspector, type AssistFn } from "@/components/blocks/Inspector";
import { A11yPanel } from "@/components/blocks/A11yPanel";
import { TemplatePicker } from "@/components/blocks/TemplatePicker";
import { getTemplate } from "@/lib/templates";

const PALETTE: BlockType[] = [
  "hero",
  "heading",
  "text",
  "columns",
  "image",
  "gallery",
  "video",
  "button",
  "form",
  "faq",
  "testimonials",
  "pricing",
  "map",
  "divider",
  "spacer",
];

type Locale = "bg" | "en";

export function PageBuilder({
  slug,
  previewHref,
  publicHref,
  initialBlocks,
  initialBlocksEn = [],
  localeEnEnabled = false,
  saveDraft,
  publish,
  assist,
  toggleLocaleEn,
  translatePage,
}: {
  slug: string;
  previewHref: string;
  publicHref: string;
  initialBlocks: Block[];
  initialBlocksEn?: Block[];
  localeEnEnabled?: boolean;
  saveDraft: (locale: string, blocks: Block[]) => Promise<PageActionResult>;
  publish: (locale: string, blocks: Block[]) => Promise<PageActionResult>;
  assist?: AssistFn;
  toggleLocaleEn?: (enabled: boolean) => Promise<PageActionResult>;
  translatePage?: (blocks: Block[]) => Promise<PageActionResult>;
}) {
  const [byLocale, setByLocale] = useState<Record<Locale, Block[]>>({
    bg: initialBlocks,
    en: initialBlocksEn,
  });
  const [locale, setLocale] = useState<Locale>("bg");
  const [enOn, setEnOn] = useState(localeEnEnabled);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialBlocks[0]?.id ?? null,
  );
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<PageActionResult | null>(null);
  const [pending, start] = useTransition();
  const dragIndex = useRef<number | null>(null);

  const blocks = byLocale[locale];
  const setBlocks = (next: Block[]) =>
    setByLocale((prev) => ({ ...prev, [locale]: next }));
  const selected = blocks.find((b) => b.id === selectedId) ?? null;

  function update(next: Block[]) {
    setBlocks(next);
    setDirty(true);
    setMsg(null);
  }

  function add(type: BlockType) {
    const b = makeBlock(type);
    update([...blocks, b]);
    setSelectedId(b.id);
  }

  function applyTemplate(id: string) {
    const tpl = getTemplate(id);
    if (!tpl) return;
    const fresh = tpl.build();
    update([...blocks, ...fresh]);
    if (fresh[0]) setSelectedId(fresh[0].id);
  }

  function patch(id: string, changes: Partial<Block>) {
    update(blocks.map((b) => (b.id === id ? ({ ...b, ...changes } as Block) : b)));
  }

  function remove(id: string) {
    update(blocks.filter((b) => b.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  function duplicate(id: string) {
    const idx = blocks.findIndex((b) => b.id === id);
    if (idx < 0) return;
    const copy = { ...blocks[idx], id: makeBlock(blocks[idx].type).id } as Block;
    const next = [...blocks];
    next.splice(idx + 1, 0, copy);
    update(next);
    setSelectedId(copy.id);
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= blocks.length) return;
    const next = [...blocks];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    update(next);
  }

  function run(action: (locale: string, b: Block[]) => Promise<PageActionResult>) {
    start(async () => {
      const r = await action(locale, blocks);
      setMsg(r);
      if (r.ok) setDirty(false);
    });
  }

  function switchLocale(next: Locale) {
    if (next === locale) return;
    if (dirty && !confirm("Има незапазени промени. Смяна на езика без запазване?")) return;
    setLocale(next);
    setSelectedId(byLocale[next][0]?.id ?? null);
    setDirty(false);
    setMsg(null);
  }

  function enableEn() {
    if (!toggleLocaleEn) return;
    start(async () => {
      const r = await toggleLocaleEn(true);
      setMsg(r);
      if (r.ok) setEnOn(true);
    });
  }

  function doTranslate() {
    if (!translatePage) return;
    if (!confirm("Да преведа текущата българска чернова на английски с AI? Това ще презапише английската чернова.")) return;
    start(async () => {
      const r = await translatePage(byLocale.bg);
      setMsg(r);
      if (r.ok) {
        // Презареждаме, за да видим преведените блокове от сървъра.
        window.location.reload();
      }
    });
  }

  return (
    <div className="flex h-[calc(100vh-140px)] min-h-[560px] flex-col overflow-hidden rounded-lg border border-ink-800">
      {/* Лента с инструменти */}
      <div className="flex items-center justify-between gap-3 border-b border-ink-800 bg-ink-900 px-4 py-2">
        <div className="flex items-center gap-2 text-sm">
          <a href={`/dashboard/sites/${slug}/pages`} className="text-ink-400 hover:text-white">
            ← Страници
          </a>
          {/* Език: табове BG/EN когато е включено */}
          {enOn ? (
            <div className="flex overflow-hidden rounded border border-ink-700 text-xs">
              {(["bg", "en"] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => switchLocale(l)}
                  className={`px-2 py-1 ${locale === l ? "bg-brand-600 text-white" : "text-ink-300 hover:bg-ink-800"}`}
                >
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
          ) : (
            toggleLocaleEn && (
              <button
                onClick={enableEn}
                disabled={pending}
                className="rounded border border-ink-700 px-2 py-1 text-xs text-ink-300 hover:border-brand-600 hover:bg-ink-800"
                title="Добави английска версия на сайта"
              >
                + English
              </button>
            )
          )}
          {enOn && locale === "en" && translatePage && (
            <button
              onClick={doTranslate}
              disabled={pending}
              className="rounded border border-ink-700 px-2 py-1 text-xs text-ink-300 hover:border-brand-600 hover:bg-ink-800"
              title="Преведи българската чернова на английски с AI"
            >
              🌐 Преведи от BG
            </button>
          )}
          {dirty && <span className="text-xs text-amber-400">• незапазени промени</span>}
          {msg?.ok && <span className="text-xs text-green-400">{msg.ok}</span>}
          {msg?.error && <span className="text-xs text-red-400">{msg.error}</span>}
        </div>
        <div className="flex items-center gap-2">
          <TemplatePicker onPick={applyTemplate} hasBlocks={blocks.length > 0} />
          <A11yPanel blocks={blocks} onSelect={setSelectedId} />
          <a href={previewHref} target="_blank" rel="noreferrer" className="btn-ghost px-3 py-1.5 text-xs">
            Преглед
          </a>
          <a href={publicHref} target="_blank" rel="noreferrer" className="btn-ghost px-3 py-1.5 text-xs">
            Публичен адрес
          </a>
          <button
            className="btn-ghost px-3 py-1.5 text-xs"
            disabled={pending}
            onClick={() => run(saveDraft)}
          >
            {pending ? "…" : "Запази чернова"}
          </button>
          <button
            className="btn-primary px-3 py-1.5 text-xs"
            disabled={pending}
            onClick={() => run(publish)}
          >
            {pending ? "…" : "Публикувай"}
          </button>
        </div>
      </div>

      <div className="grid flex-1 grid-cols-[180px_1fr_300px] overflow-hidden">
        {/* Палитра */}
        <aside className="overflow-y-auto border-r border-ink-800 bg-ink-900 p-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
            Блокове
          </h3>
          <div className="flex flex-col gap-1.5">
            {PALETTE.map((t) => (
              <button
                key={t}
                onClick={() => add(t)}
                className="rounded border border-ink-700 px-2 py-1.5 text-left text-sm text-ink-200 hover:border-brand-600 hover:bg-ink-800"
              >
                + {BLOCK_LABELS[t]}
              </button>
            ))}
          </div>
          <p className="mt-3 text-[11px] leading-snug text-ink-600">
            Кликни, за да добавиш. Влачи блоковете в средата, за да ги подредиш.
          </p>
        </aside>

        {/* Платно */}
        <main className="overflow-y-auto bg-ink-950 p-6">
          <div className="mx-auto max-w-3xl rounded-lg bg-white shadow-xl">
            {blocks.length === 0 ? (
              <TemplatePicker onPick={applyTemplate} variant="cards" />
            ) : (
              <div className="flex flex-col">
                {blocks.map((b, i) => (
                  <div
                    key={b.id}
                    draggable
                    onDragStart={() => (dragIndex.current = i)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragIndex.current !== null && dragIndex.current !== i) {
                        move(dragIndex.current, i);
                      }
                      dragIndex.current = null;
                    }}
                    onClick={() => setSelectedId(b.id)}
                    className={`group relative cursor-pointer border-2 px-4 py-2 ${
                      selectedId === b.id
                        ? "border-brand-500"
                        : "border-transparent hover:border-brand-200"
                    }`}
                  >
                    {/* Контроли на блока */}
                    <div className="absolute right-1 top-1 z-10 hidden gap-1 rounded bg-ink-900/90 p-1 group-hover:flex">
                      <IconBtn title="Нагоре" onClick={(e) => { e.stopPropagation(); move(i, i - 1); }}>↑</IconBtn>
                      <IconBtn title="Надолу" onClick={(e) => { e.stopPropagation(); move(i, i + 1); }}>↓</IconBtn>
                      <IconBtn title="Дублирай" onClick={(e) => { e.stopPropagation(); duplicate(b.id); }}>⧉</IconBtn>
                      <IconBtn title="Изтрий" danger onClick={(e) => { e.stopPropagation(); remove(b.id); }}>✕</IconBtn>
                    </div>
                    <div className="pointer-events-none">
                      <BlockRender block={b} locale={locale} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>

        {/* Инспектор */}
        <aside className="overflow-y-auto border-l border-ink-800 bg-ink-900 p-4">
          {selected ? (
            <Inspector block={selected} onChange={(c) => patch(selected.id, c)} assist={assist} />
          ) : (
            <p className="text-sm text-ink-500">
              Изберете блок от платното, за да го редактирате.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  title,
  danger,
}: {
  children: React.ReactNode;
  onClick: (e: React.MouseEvent) => void;
  title: string;
  danger?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`h-6 w-6 rounded text-xs ${danger ? "text-red-400 hover:bg-red-500/20" : "text-ink-200 hover:bg-ink-700"}`}
    >
      {children}
    </button>
  );
}
