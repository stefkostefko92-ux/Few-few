import type { Metadata } from "next";
import { SITE } from "../../lib/site";
import { JsonLd } from "../../components/JsonLd";
import { breadcrumbLd } from "../../lib/jsonld";
import { AboutBody } from "./AboutBody";

// Metadata + JSON-LD stay in the canonical BG source of truth (SEO).
export const metadata: Metadata = {
  title: "За нас",
  description: "АСО е премиум браузърен портал за игри на карти и маса, създаден от Carbon Stealth VCC.",
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
      <AboutBody />
    </>
  );
}
