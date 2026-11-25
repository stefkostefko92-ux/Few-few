'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// Вграденият превод на браузъра (Translator API — Chrome/Edge, на
// устройството: нищо не излиза навън). Резерва, когато сървърният
// автоматичен превод не е наличен (docs/geo-autotranslate-spec.md, Б).
// Превежда САМО текстовете на създателя (името, биото, заглавията) — не
// интерфейса, който вече е на езика на посетителя.

type TranslatorLike = { translate(text: string): Promise<string> };
type TranslatorApi = {
  availability(opts: { sourceLanguage: string; targetLanguage: string }): Promise<string>;
  create(opts: { sourceLanguage: string; targetLanguage: string }): Promise<TranslatorLike>;
};

function api(): TranslatorApi | null {
  const candidate = (globalThis as { Translator?: TranslatorApi }).Translator;
  return candidate && typeof candidate.create === 'function' ? candidate : null;
}

export function BrowserTranslate({
  from,
  to,
  texts,
  originalHref,
  labels,
}: {
  from: string;
  to: string;
  texts: string[];
  originalHref: string;
  labels: { done: string; showOriginal: string; translate: string; translating: string };
}) {
  const [state, setState] = useState<'idle' | 'offer' | 'working' | 'done'>('idle');
  const started = useRef(false);

  const run = useCallback(async () => {
    const translatorApi = api();
    if (!translatorApi || started.current) return;
    started.current = true;
    setState('working');
    try {
      const translator = await translatorApi.create({ sourceLanguage: from, targetLanguage: to });
      const wanted = new Set(texts.map((text) => text.trim()).filter(Boolean));
      const done = new Map<string, string>();
      for (const text of wanted) done.set(text, await translator.translate(text));
      // Само елементите със съдържание на създателя (data-ct) — интерфейсът е
      // вече на езика на посетителя и не бива да се пипа.
      for (const element of document.querySelectorAll<HTMLElement>('main [data-ct]')) {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const value = node.nodeValue ?? '';
          const translated = done.get(value.trim());
          if (translated) node.nodeValue = value.replace(value.trim(), translated);
        }
        element.setAttribute('lang', to);
      }
      document.querySelector('main')?.setAttribute('data-ai-translated', to);
      setState('done');
    } catch {
      started.current = false;
      setState('idle');
    }
  }, [from, to, texts]);

  useEffect(() => {
    const translatorApi = api();
    if (!translatorApi) return;
    let cancelled = false;
    translatorApi
      .availability({ sourceLanguage: from, targetLanguage: to })
      .then((availability) => {
        if (cancelled) return;
        // „available“ → превеждаме веднага; изтегляне на модела иска жест на човека.
        if (availability === 'available') void run();
        else if (availability === 'downloadable' || availability === 'downloading') setState('offer');
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [from, to, run]);

  if (state === 'idle') return null;
  return (
    <p className="pf-muted mt-3 text-xs" role="status">
      {state === 'offer' && (
        <button type="button" onClick={() => void run()} className="underline underline-offset-2">
          {labels.translate}
        </button>
      )}
      {state === 'working' && labels.translating}
      {state === 'done' && (
        <>
          {labels.done} ·{' '}
          <a href={originalHref} className="underline underline-offset-2">
            {labels.showOriginal}
          </a>
        </>
      )}
    </p>
  );
}
