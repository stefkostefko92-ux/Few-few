"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Dict } from "@/lib/i18n";

// Carries the admin's interface-wording overrides to client components (form,
// header, cookie banner…), which can't read the database themselves. The
// server layout loads them once per request and hands them down here.
const UiContext = createContext<Dict>({});

export function UiProvider({ ui, children }: { ui: Dict; children: ReactNode }) {
  return <UiContext.Provider value={ui}>{children}</UiContext.Provider>;
}

export const useUi = () => useContext(UiContext);
