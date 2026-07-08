"use client";

import { useEffect, useRef, useState } from "react";
import { takeSharedState } from "@/lib/share";

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
      try {
        setState({ ...initialRef.current, ...clean(shared) });
      } catch {
        // невалиден линк → остани на подразбиранията, не срива
      }
      loaded.current = true;
      return;
    }
    try {
      const raw = localStorage.getItem(key);
      if (raw) setState({ ...initialRef.current, ...clean(JSON.parse(raw)) });
    } catch {
      // повреден/несъвместим запис → започваме начисто
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
