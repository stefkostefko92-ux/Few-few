"use client";

import { usePathname } from "next/navigation";

// Скрива части от рамката на сайта (футъра) в админ панела — там има своя рамка.
export function HideOnAdmin({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname?.startsWith("/admin")) return null;
  return <>{children}</>;
}
