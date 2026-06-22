import type { Metadata } from "next";
import { buildMetadata, webPageLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { PageHero } from "@/components/ui";
import { Callout } from "@/components/content";
import { SignalForm } from "./SignalForm";

export const metadata: Metadata = buildMetadata({
  title: "Сигнали и оплаквания",
  description:
    "Подайте сигнал за проблем в Дупница — дупка, осветление, чистота, вода. Получавате номер за проследяване.",
  path: "/signali",
});

export default function SignaliPage() {
  return (
    <>
      <JsonLd data={webPageLd({ name: "Сигнали и оплаквания", path: "/signali" })} />
      <PageHero
        eyebrow="Гражданско участие"
        title="Сигнали и оплаквания"
        intro="Забелязали сте проблем в града? Подайте сигнал тук и получете номер, с който да го проследите."
        crumbs={[{ name: "Сигнали", path: "/signali" }]}
      />

      <div className="container-content py-10">
        <Callout tone="info">
          Това е граждански портал. Препращаме сигналите към общината по
          възможност, но за спешни случаи и официални преписки използвайте и
          официалните канали на Община Дупница. При опасност за живот: 112.
        </Callout>

        <SignalForm />
      </div>
    </>
  );
}
