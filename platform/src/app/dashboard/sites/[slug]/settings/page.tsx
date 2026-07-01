import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getSiteForUser } from "@/lib/access";
import { safeFont } from "@/lib/theme";
import { PLATFORM_APEX } from "@/lib/domains";
import { SettingsForm } from "@/components/SettingsForm";
import { DomainSettings } from "@/components/DomainSettings";

export const dynamic = "force-dynamic";

export default async function SiteSettings({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await requireUser();
  const found = await getSiteForUser(user, slug, "manage");
  if (!found) notFound();
  const s = found.site;

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/dashboard/sites/${slug}`} className="text-xs text-ink-500 hover:text-ink-300">
          ← {s.name}
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-white">Настройки на сайта</h1>
        <p className="text-sm text-ink-400">Външен вид, меню и импресум на публикувания сайт.</p>
      </div>

      <SettingsForm
        slug={slug}
        initial={{
          brandColor: s.brandColor ?? "",
          fontFamily: safeFont(s.fontFamily),
          logoUrl: s.logoUrl ?? "",
          faviconUrl: s.faviconUrl ?? "",
          navEnabled: s.navEnabled,
          footerText: s.footerText ?? "",
          privacyUrl: s.privacyUrl ?? "",
        }}
      />

      <div>
        <h2 className="mb-1 text-lg font-semibold text-white">Домейни и публикуване</h2>
        <p className="mb-3 text-sm text-ink-400">
          Пуснете сайта на наш поддомейн или на свой собствен домейн.
        </p>
        <DomainSettings
          init={{
            slug,
            apex: PLATFORM_APEX,
            subdomain: s.subdomain ?? "",
            customDomain: s.customDomain ?? "",
            domainVerified: s.domainVerified,
            domainToken: s.domainToken ?? "",
            published: s.published,
            premium: s.premium,
            isOwner: user.role === "OWNER",
          }}
        />
      </div>
    </div>
  );
}
