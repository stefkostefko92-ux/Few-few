import Link from "next/link";
import { prisma } from "@/lib/db";
import AdminShell from "@/components/admin/AdminShell";
import SectionOrder from "@/components/admin/SectionOrder";
import { ensureSeeded } from "@/lib/content";
import { isSectionKey } from "@/lib/cms";
import { previewUrl } from "@/lib/admin-preview";

export const dynamic = "force-dynamic";

type Row = { key: string; label: string; group: string; enabled: boolean; order: number };

// What each settings/legal entry is for, in one line.
const ABOUT: Record<string, string> = {
  hero: "Голямото заглавие, текстът, снимката и фактите точно под тях.",
  settings: "Име, лого, телефон, имейл, адрес и връзки към Facebook и картата.",
  seo: "Заглавие и описание в Google, ключови думи, снимка при споделяне — за всеки език.",
  org: "Официалното име, адресът и координатите, които търсачките четат.",
  ui: "Всички надписи по бутоните, менюто, формата и банера за бисквитки.",
  legal_privacy: "Политиката за поверителност.",
  legal_cookie: "Политиката за бисквитките.",
  legal_termini: "Общите условия за ползване.",
};

function Card({ s }: { s: Row }) {
  return (
    <div className="ad-card">
      <div>
        <h3>{s.label || s.key}</h3>
        {ABOUT[s.key] && <p>{ABOUT[s.key]}</p>}
      </div>
      <div className="meta">
        <a className="ad-btn ad-btn--ghost" href={previewUrl(s.key)} target="_blank" rel="noopener">Преглед</a>
        <Link className="ad-btn ad-btn--primary" href={`/admin/content/${s.key}`}>Редактирай</Link>
      </div>
    </div>
  );
}

export default async function ContentList() {
  await ensureSeeded();
  const rows = (await prisma.content.findMany({ orderBy: { order: "asc" } })) as Row[];
  const sections = rows.filter((r) => isSectionKey(r.key));
  const hero = rows.filter((r) => r.key === "hero");
  const settings = rows.filter((r) => r.group === "settings");
  const legal = rows.filter((r) => r.group === "legal");

  return (
    <AdminShell active="content" title="Съдържание" subtitle="Всичко, което се вижда на сайта — текстове, снимки, подредба — на италиански, български и английски.">
      <div className="ad-help">
        <b>Как работи.</b> Текстът се пише за всеки език отделно. Снимките, иконите, телефоните и подредбата са <em>общи</em> —
        сменяте ги веднъж и важат и за трите езика. Промените влизат в сайта веднага след <em>Запази</em>.
      </div>

      <h2 className="ad-section-title">Начало на страницата</h2>
      <div className="ad-grid">{hero.map((s) => <Card key={s.key} s={s} />)}</div>

      <h2 className="ad-section-title">Секции на страницата</h2>
      <p className="ad-section-lead">В реда, в който се показват. Стрелките ги местят, „Видима/Скрита“ ги включва и изключва.</p>
      <SectionOrder
        initial={sections.map((s) => ({ key: s.key, label: s.label || s.key, enabled: s.enabled, preview: previewUrl(s.key) }))}
      />

      <h2 className="ad-section-title">Настройки</h2>
      <div className="ad-grid">{settings.map((s) => <Card key={s.key} s={s} />)}</div>

      <h2 className="ad-section-title">Правни страници</h2>
      <div className="ad-grid">{legal.map((s) => <Card key={s.key} s={s} />)}</div>

      {rows.length === 0 && <div className="ad-empty">Няма намерено съдържание. Изпълнете <code>npm run setup</code>.</div>}
    </AdminShell>
  );
}
