"use client";

import { usePathname } from "next/navigation";

// Скрива публичните елементи (хедър, футър, лента за достъпност) в админ зоната.
export function ChromeGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname?.startsWith("/admin")) return null;
  return <>{children}</>;
}
