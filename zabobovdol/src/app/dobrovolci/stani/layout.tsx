import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";

// page.tsx е клиентски компонент (формата) — metadata идва оттук, иначе се
// наследяваше canonical-ът и заглавието на началната страница.
export const metadata: Metadata = buildMetadata({
  title: "Станете доброволец в Бобов дол",
  description:
    "Отделете малко време, за да помогнете на възрастен човек в Бобов дол — с телефона, документи, пазар или просто компания. Записването минава през кратък преглед.",
  path: "/dobrovolci/stani",
});

export default function BecomeVolunteerLayout({ children }: { children: React.ReactNode }) {
  return children;
}
