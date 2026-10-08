import type { Metadata } from "next";

// Админ зоната не се индексира.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  // Без това наследява canonical „/“ от layout-а → Google я брои за копие
  // на началната („алтернативна страница с canonical“ в Search Console).
  alternates: { canonical: null },
  title: "Админ",
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
