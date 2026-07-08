"use client";

import { useEffect, useRef, useState } from "react";
import { takeSharedState } from "@/lib/share";

// Пази състоянието на редактора в localStorage — данните остават само на
// устройството на потребителя (нямаме сървърна база). Първият рендер е с
// подразбиранията (заради SSR hydration), после се зарежда запазеното — или
// споделеното чрез линк (#p=…), което има предимство.
export function useLocalState<T extends object>(key: string, initial: T) {
  const [state, setState] = useState<T>(initial);
  const initialRef = useRef(initial);
  const loaded = useRef(false);

  useEffect(() => {
    const shared = takeSharedState<Partial<T>>();
    if (shared) {
      setState({ ...initialRef.current, ...shared });
      loaded.current = true;
      return;
    }
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        setState({ ...initialRef.current, ...(JSON.parse(raw) as Partial<T>) });
      }
    } catch {
      // повреден запис → започваме начисто
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
