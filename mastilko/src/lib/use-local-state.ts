"use client";

import { useEffect, useRef, useState } from "react";
import { takeSharedState } from "@/lib/share";
import { BACKUPS_EVENT, pushBackup } from "@/lib/backups";

// Пази състоянието на редактора в localStorage — данните остават само на
// устройството на потребителя (нямаме сървърна база). Първият рендер е с
// подразбиранията (заради SSR hydration), после се зарежда запазеното — или
// споделеното чрез линк (#p=…), което има предимство.
//
// `parse` валидира недоверен вход (споделен линк и стар/повреден localStorage)
// през схемата на редактора — иначе грешен тип стойност чупи рендера.
export function useLocalState<T extends object>(
  key: string,
  initial: T,
  parse?: (raw: unknown) => Partial<T>,
) {
  const [state, setState] = useState<T>(initial);
  const initialRef = useRef(initial);
  const parseRef = useRef(parse);
  const loaded = useRef(false);

  useEffect(() => {
    const clean = (raw: unknown): Partial<T> =>
      parseRef.current ? parseRef.current(raw) : (raw as Partial<T>);

    const shared = takeSharedState<unknown>();
    if (shared !== null) {
      // Валидираме ПРЕДИ да питаме и преди да пипнем каквото и да било. Преди
      // невалиден линк след „ОК“ оставяше състоянието на подразбиранията, а
      // вторият effect ги записваше ВЪРХУ проекта на човека — пълна загуба.
      // Сега счупен или несъвместим линк се пренебрегва изцяло.
      let incoming: Partial<T> | null = null;
      try {
        incoming = clean(shared);
      } catch {
        incoming = null;
      }

      if (incoming) {
        // Споделеният линк НЕ бива да трие тихо запазената работа — питаме и
        // пазим копие. Копията са до три (виж lib/backups.ts) и се връщат от
        // „Предишни версии“ в ProjectFile.
        let existing: string | null = null;
        try {
          existing = localStorage.getItem(key);
        } catch {
          /* забранено хранилище → няма какво да губим */
        }
        let apply = true;
        if (existing) {
          apply = window.confirm(
            "Този линк съдържа споделен дизайн.\n\n" +
              "„ОК“ — зареждам споделения. Твоят проект се пази и можеш да го върнеш от „Предишни версии“ под редактора.\n" +
              "„Отказ“ — оставам на твоя проект.",
          );
          if (apply) {
            try {
              pushBackup(localStorage, key, existing);
              // ProjectFile е дете на студиото и ефектът му вече е минал, преди
              // да стигнем тук — казваме му да прочете списъка наново.
              window.dispatchEvent(new CustomEvent(BACKUPS_EVENT, { detail: key }));
            } catch {
              /* пълно хранилище → продължаваме, но без резервно копие */
            }
          }
        }
        if (apply) {
          setState({ ...initialRef.current, ...incoming });
          loaded.current = true;
          return;
        }
      }
      // отказал, или линкът е невалиден → зареждаме неговия запис както обикновено
    }
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(key);
      if (raw) setState({ ...initialRef.current, ...clean(JSON.parse(raw)) });
    } catch {
      // Повреден или несъвместим запис (например след затягане на схемата).
      // Започваме начисто, НО първо го местим в копията: иначе ефектът долу
      // веднага записва подразбиранията върху него и проектът изчезва.
      if (raw) {
        try {
          pushBackup(localStorage, key, raw);
        } catch {
          /* пълно/забранено хранилище → няма къде да го спасим */
        }
      }
    }
    loaded.current = true;
  }, [key]);

  useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      // пълно/забранено хранилище → просто не запазваме
    }
  }, [key, state]);

  return [state, setState] as const;
}
