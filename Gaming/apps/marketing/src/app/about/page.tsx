import type { Metadata } from "next";
import { SITE } from "../../lib/site";
import { JsonLd } from "../../components/JsonLd";
import { breadcrumbLd } from "../../lib/jsonld";

export const metadata: Metadata = {
  title: "За нас",
  description:
    "АСО е премиум браузърен портал за игри на карти и маса, създаден от Carbon Stealth VCC.",
  alternates: { canonical: "/about/" },
};

export default function About() {
  return (
    <>
      <JsonLd
        data={breadcrumbLd([
          { name: "Начало", url: `${SITE.url}/` },
          { name: "За нас", url: `${SITE.url}/about/` },
        ])}
      />
      <article className="container" style={{ padding: "3rem 1.25rem", maxWidth: 720 }}>
        <h1>За АСО</h1>
        <p style={{ color: "var(--ink-300)", marginTop: "1rem" }}>
          АСО е премиум браузърен портал за 18 класически игри на карти и маса в реално време.
          Играй срещу приятели и ботове, изкачвай класацията и отключвай козметика — всичко
          безплатно, направо в браузъра.
        </p>
        <p style={{ color: "var(--ink-300)", marginTop: "1rem" }}>
          Никакъв „плати, за да печелиш“. Парите купуват само козметика и комфорт. Игрите със
          залог се играят само с виртуални чипове — социална игра, не хазарт за реални пари.
        </p>
        <p style={{ color: "var(--ink-300)", marginTop: "1rem" }}>
          Създадено от{" "}
          <a href={SITE.org.url} target="_blank" rel="noopener noreferrer">
            Carbon Stealth VCC
          </a>
          .
        </p>
      </article>
    </>
  );
}
