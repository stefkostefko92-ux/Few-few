import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";

// page.tsx е клиентски компонент (формата) — metadata идва оттук, иначе се
// наследяваше canonical-ът и заглавието на началната страница.
export const metadata: Metadata = buildMetadata({
  title: "Подайте зов за помощ в Бобов дол",
  description:
    "Потърсете помощ за възрастен човек в Бобов дол или предложете своята помощ или дарение. Зовът се публикува след кратък преглед.",
  path: "/zov-za-pomosht/nova",
});

export default function NewHelpLayout({ children }: { children: React.ReactNode }) {
  return children;
}
