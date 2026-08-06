'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Хамбургер менюто за телефон.
 *
 * Островче е, не цял клиентски layout: съдържанието идва като `children` и се
 * рендира на СЪРВЪРА. Това не е стилово предпочитание — `Icon` чете иконите от
 * диска с `node:fs`, значи изобщо не може да се изпълни в браузъра. Тук живее
 * само състоянието отворено/затворено.
 *
 * Достъпност, всяко от които е реално изискване, не украса:
 *  - `aria-expanded` + `aria-controls` — иначе бутонът е просто картинка и
 *    екранният четец не съобщава, че нещо се разгъва;
 *  - `hidden` атрибут, не само CSS клас — панел, скрит с `opacity`/`height`,
 *    остава във фокусната верига и клавиатурата „изчезва“ в невидими връзки;
 *  - Escape затваря И връща фокуса на бутона — иначе фокусът остава в скрит
 *    елемент, което е задънена улица;
 *  - затваря се при смяна на страницата, защото в App Router навигацията НЕ
 *    премонтира layout-а: без това менюто остава отворено върху новата страница.
 */
export function MobileNav({
  label,
  openIcon,
  closeIcon,
  children,
}: {
  label: string;
  openIcon: React.ReactNode;
  closeIcon: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();

  // Навигацията запазва layout-а → менюто трябва да се затвори само.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      // Фокусът се връща там, откъдето е тръгнал — иначе остава върху елемент,
      // който току-що стана `hidden`.
      buttonRef.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="xl:hidden">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={label}
        className="flex h-11 w-11 items-center justify-center rounded-lg border border-white/10 text-silver-300 transition-colors hover:border-cyan-500 hover:text-cyan-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
      >
        {/* Иконата е декорация: смисълът е в `aria-label` на бутона. */}
        <span aria-hidden="true">{open ? closeIcon : openIcon}</span>
      </button>

      <div
        id={panelId}
        hidden={!open}
        // `top-full`: съдържащият блок е `header` (той е `sticky`, тоест
        // позициониран), значи 100% отгоре го слага точно ПОД хедъра. Без него
        // `absolute` ползва статичната си позиция и панелът ляга върху самия
        // ред с логото.
        // Фонът е НЕПРОЗРАЧЕН, не `/95` с `backdrop-blur`. Измерено с реален
        // рендер: панелът застъпва заглавието на страницата и 5% просветване
        // при едър бял текст върху почти черен фон се вижда отчетливо —
        // менюто ставаше нечетимо на точно най-важния екран. Полупрозрачността
        // остава за хедъра, където отдолу минава ситен текст.
        className="absolute inset-x-0 top-full z-40 max-h-[calc(100dvh-100%)] overflow-y-auto border-b border-white/10 bg-ink-950 px-4 py-4 shadow-2xl shadow-black/50"
      >
        {children}
      </div>
    </div>
  );
}
