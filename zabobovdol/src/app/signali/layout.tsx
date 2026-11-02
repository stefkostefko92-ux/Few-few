import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";

// page.tsx е клиентски компонент (формата) и не може сам да изнася metadata —
// без този layout страницата наследяваше заглавието, описанието и canonical-а
// на началната страница (Google я виждаше като дубликат на „/“).
export const metadata: Metadata = buildMetadata({
  title: "Сигнали до общината Бобов дол",
  description:
    "Подайте сигнал за проблем в Бобов дол — пътища и тротоари, улично осветление, отпадъци, ВиК, шум, бездомни животни. Препращаме го към съответната институция.",
  path: "/signali",
});

export default function SignaliLayout({ children }: { children: React.ReactNode }) {
  return children;
}
