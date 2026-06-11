import type { Metadata } from "next";
import { SITE } from "../../lib/site";
import { JsonLd } from "../../components/JsonLd";
import { breadcrumbLd } from "../../lib/jsonld";
import "../legal.css";

export const metadata: Metadata = {
  title: "Политика за бисквитки",
  description: "Как АСО използва бисквитки и подобни технологии.",
  alternates: { canonical: "/cookies/" },
};

const UPDATED = "юни 2026 г.";

export default function Cookies() {
  return (
    <>
      <JsonLd
        data={breadcrumbLd([
          { name: "Начало", url: `${SITE.url}/` },
          { name: "Бисквитки", url: `${SITE.url}/cookies/` },
        ])}
      />
      <article className="legal container">
        <h1>Политика за бисквитки</h1>
        <p className="legal-updated">Последна актуализация: {UPDATED}</p>

        <p>
          Използваме само строго необходими бисквитки, нужни за работата на услугата. Не използваме
          рекламни или проследяващи бисквитки на трети страни.
        </p>

        <h2>Строго необходими</h2>
        <ul>
          <li>
            <code>aso_at</code>, <code>aso_rt</code> — httpOnly бисквитки за сесия (вход и
            подновяване на достъпа). Без тях не можете да останете вписани.
          </li>
          <li>
            Краткотрайна бисквитка за състояние при вход с Google/Facebook (CSRF защита).
          </li>
        </ul>
        <p>
          Тъй като тези бисквитки са строго необходими, те не изискват съгласие. Можете да ги
          блокирате от браузъра си, но тогава входът няма да работи.
        </p>

        <h2>Локално съхранение</h2>
        <p>
          Пазим дребни предпочитания (език, намалено движение, потвърждение на банера за бисквитки)
          в локалното хранилище на браузъра — те не напускат устройството Ви.
        </p>

        <h2>Контакт</h2>
        <p>
          Въпроси: <a href="mailto:privacy@carbonstealth.eu">privacy@carbonstealth.eu</a>. Вижте и{" "}
          <a href="/privacy/">Политиката за поверителност</a>.
        </p>
      </article>
    </>
  );
}
