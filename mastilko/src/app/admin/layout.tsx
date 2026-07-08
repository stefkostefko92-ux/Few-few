import type { Metadata } from "next";

// Админ зоната не се индексира.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Админ",
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
