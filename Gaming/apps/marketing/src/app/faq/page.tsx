import type { Metadata } from "next";
import { SITE } from "../../lib/site";
import { SITE_FAQ } from "../../content/faq";
import { JsonLd } from "../../components/JsonLd";
import { breadcrumbLd, siteFaqLd } from "../../lib/jsonld";
import { FaqBody } from "./FaqBody";
import { alternatesFor } from "../../lib/seo";
import "../legal.css";

// Metadata + JSON-LD stay in the canonical BG source of truth (SEO).
export const metadata: Metadata = {
  title: "Често задавани въпроси",
  description: "Отговори на въпроси за АСО — безплатния браузърен портал за игри на карти, маса, билярд и снукър.",
  alternates: alternatesFor("bg", "/faq/"),
};

export default function Faq() {
  return (
    <>
      <JsonLd
        data={[
          breadcrumbLd([
            { name: "Начало", url: `${SITE.url}/` },
            { name: "Въпроси", url: `${SITE.url}/faq/` },
          ]),
          siteFaqLd(SITE_FAQ),
        ]}
      />
      <FaqBody />
    </>
  );
}
