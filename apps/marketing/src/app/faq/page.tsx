import type { Metadata } from "next";
import { SITE } from "../../lib/site";
import { SITE_FAQ } from "../../content/faq";
import { JsonLd } from "../../components/JsonLd";
import { breadcrumbLd, siteFaqLd } from "../../lib/jsonld";
import "../legal.css";

export const metadata: Metadata = {
  title: "Често задавани въпроси",
  description: "Отговори на въпроси за АСО — безплатния браузърен портал за игри на карти, маса, билярд и снукър.",
  alternates: { canonical: "/faq/" },
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
      <article className="legal container">
        <h1>Често задавани въпроси</h1>
        <p className="legal-updated">Всичко за АСО на едно място.</p>
        {SITE_FAQ.map((f) => (
          <div key={f.question}>
            <h2>{f.question}</h2>
            <p>{f.answer}</p>
          </div>
        ))}
        <p className="legal-foot">
          Готов за игра? <a href={SITE.playUrl}>Влез и играй</a>.
        </p>
      </article>
    </>
  );
}
