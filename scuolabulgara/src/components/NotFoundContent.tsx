import Link from "next/link";
import { connection } from "next/server";
import { getOne } from "@/lib/content";
import { t } from "@/lib/i18n";
import { RosetteMotif } from "./Stitch";

// Inner 404 (no <html>/<body>) so it can be embedded inside any layout. It
// can't know the visitor's language, so it says it in all three — each in the
// wording set in the admin („Надписи по бутони и менюта“).
export default async function NotFoundContent() {
  await connection(); // read at request time, so an edit in the admin shows at once
  const [it, bg, en] = await Promise.all([getOne("it", "ui"), getOne("bg", "ui"), getOne("en", "ui")]);
  return (
    <main className="notfound">
      <div className="wrap notfound__grid">
        <RosetteMotif size={9} className="notfound__rosette" />
        <div>
          <p className="notfound__code">404</p>
          <h1 lang="bg">{t("bg", "notfound.text", bg)}</h1>
          <p lang="it">{t("it", "notfound.text", it)}</p>
          <p lang="en">{t("en", "notfound.text", en)}</p>
          <div className="actions">
            <Link className="btn btn--red" href="/it" lang="it">{t("it", "backHome", it)}</Link>
            <Link className="btn btn--line" href="/bg" lang="bg">{t("bg", "backHome", bg)}</Link>
            <Link className="btn btn--line" href="/en" lang="en">{t("en", "backHome", en)}</Link>
          </div>
        </div>
      </div>
    </main>
  );
}
