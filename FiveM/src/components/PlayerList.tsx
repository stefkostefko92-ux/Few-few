'use client';

import { useEffect, useRef } from 'react';

/**
 * „Кой играе сега“ — истински модален прозорец, не разгъващ се блок.
 *
 * Ползва НАТИВНИЯ `<dialog>` с `showModal()`, не собствен overlay. Разликата не
 * е стилова: браузърът сам дава фокусен капан, `Escape`, inert на останалата
 * страница и слой над всичко (top layer, без война със `z-index`). Собствена
 * реализация трябва да повтори всичко това и обикновено повтаря половината.
 *
 * ТОВА СА ЛИЧНИ ДАННИ. Затова:
 *  - показва се САМО име (`identifiers` от `players.json` не се четат изобщо);
 *  - „не знаем“ (`seenAt === null`) се различава от „няма никого“ (празен
 *    списък) — иначе твърдим, че сървър е празен, когато той просто не ни казва;
 *  - до списъка стои откъде идва и как се маха (чл. 14 и чл. 21 ОРЗД).
 */
export function PlayerList({
  names,
  seenAt,
  trigger,
  labels,
}: {
  names: string[];
  seenAt: Date | null;
  /** Съдържанието на бутона — статусът, както се вижда в списъка. */
  trigger: React.ReactNode;
  labels: {
    title: string;
    hidden: string;
    none: string;
    note: string;
    close: string;
    open: string;
  };
}) {
  const ref = useRef<HTMLDialogElement>(null);

  // Затваряне при клик върху фона. `<dialog>` праща клика към себе си, когато
  // е върху ::backdrop — затова се сверява дали целта е самият диалог.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const onClick = (event: MouseEvent) => {
      if (event.target === dialog) dialog.close();
    };
    dialog.addEventListener('click', onClick);
    return () => dialog.removeEventListener('click', onClick);
  }, []);

  const known = seenAt !== null;

  return (
    <>
      {/* БЕЗ `aria-label` на бутона — той ЗАМЕСТВА съдържанието при
          изчисляване на достъпното име, тоест четецът чуваше „Виж кой играе“
          и нищо повече: нито „64 от 128“, нито текстовия статус, който
          `ServerRow`/`ServerCard` слагат вътре точно за да се чете. Действието
          върви като `sr-only` текст СЛЕД съдържанието, така че името е
          „64 от 128 играчи, Виж кой играе“ — данните първи, после глаголът
          (2.5.3 Label in Name: видимото трябва да е част от името). */}
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        disabled={!known}
        title={known ? undefined : labels.hidden}
        className="flex items-center gap-2 rounded-lg px-1 text-start transition-colors enabled:hover:text-cyan-300 enabled:focus-visible:outline enabled:focus-visible:outline-2 enabled:focus-visible:outline-cyan-400 disabled:cursor-default"
      >
        {trigger}
        {known && <span className="sr-only">{labels.open}</span>}
      </button>

      {/* `data-nosnippet`: имената са в сървърния HTML на индексируема
          страница, а политиката обещава „без индексиране на самите имена“.
          Обещание без механизъм не е обещание. Това е минималният: казва на
          търсачката да не показва този блок в откъси. НЕ е пълно „без
          индексиране“ — за това имената трябва да се дърпат при клик, не да
          се рендират на сървъра; решение на собственика, отбелязано в одита. */}
      <dialog
        ref={ref}
        data-nosnippet=""
        className="max-w-md rounded-xl border border-white/10 bg-ink-900 p-0 text-silver-200 backdrop:bg-black/70 open:flex open:flex-col"
      >
        <div className="flex items-center justify-between gap-4 border-b border-white/10 px-4 py-3">
          <h2 className="text-base font-semibold">
            {labels.title} ({names.length})
          </h2>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            className="rounded-lg px-2 py-1 text-silver-400 hover:text-cyan-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
          >
            {labels.close}
          </button>
        </div>

        <div className="max-h-[60dvh] overflow-y-auto px-4 py-3">
          {names.length === 0 ? (
            <p className="text-sm text-silver-400">{labels.none}</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {names.map((name, index) => (
                // Ключът носи и индекса: двама играчи с еднакъв ник са двама
                // играчи, а не дубликат, който да се слее.
                <li
                  key={`${name}-${index}`}
                  className="rounded border border-white/10 bg-ink-950 px-2 py-0.5 text-sm"
                >
                  {name}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 border-t border-white/10 pt-3 text-xs text-silver-500">{labels.note}</p>
        </div>
      </dialog>
    </>
  );
}
