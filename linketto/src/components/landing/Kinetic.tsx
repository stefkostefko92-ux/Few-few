import type { CSSProperties } from 'react';
import { RTL_LOCALES } from '@/i18n/locales';

// Кинетична типография без JS: изречението се реже на редове, думите на
// неразкъсваеми блокове, а думите — на букви (--i = ред за стъпаловидния
// вход). Екранните четци получават целия текст веднъж (sr-only); визуалният
// слой е aria-hidden. В RTL (арабски/иврит/фарси) буквите не се режат —
// иначе се губи свързването на знаците.

export function splitSentences(text: string): string[] {
  const parts = text.split(/(?<=[.!?…。！？])\s+/).filter(Boolean);
  return parts.length > 0 ? parts : [text];
}

export function KineticLines({
  text,
  locale,
  split = true,
  ghost = false,
}: {
  text: string;
  locale: string;
  /** режи на отделни изречения-редове */
  split?: boolean;
  /** RGB призраци (pseudo-елементи) върху всеки ред */
  ghost?: boolean;
}) {
  const rtl = RTL_LOCALES.includes(locale);
  const lines = split ? splitSentences(text) : [text];
  let index = 0;
  return (
    <>
      <span className="sr-only">{text}</span>
      {lines.map((line, lineIndex) => (
        <span
          key={lineIndex}
          aria-hidden="true"
          data-text={ghost ? line : undefined}
          className={`lx-line${ghost ? ' lx-split' : ''}`}
        >
          {line.split(' ').map((word, wordIndex) => (
            <span key={wordIndex}>
              {wordIndex > 0 ? ' ' : null}
              <span className="lx-w">
                {rtl
                  ? word
                  : Array.from(word).map((ch, chIndex) => (
                      <span
                        key={chIndex}
                        className="lx-ch"
                        style={{ '--i': index++ } as CSSProperties}
                      >
                        {ch}
                      </span>
                    ))}
              </span>
            </span>
          ))}
        </span>
      ))}
    </>
  );
}
