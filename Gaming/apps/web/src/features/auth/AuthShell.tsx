import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Panel } from "../../ui";
import { LanguageSwitcher } from "../../app/LanguageSwitcher";

/** Centered, branded chrome shared by the verify / forgot / reset screens. */
export function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="mb-8 text-center">
        <h1 className="font-display text-6xl tracking-wide text-brass-300">{t("brand")}</h1>
        <p className="mt-2 text-ink-300">{t("tagline")}</p>
      </div>
      <Panel className="w-full max-w-md">
        <h2 className="mb-6 text-2xl text-ink-100">{title}</h2>
        {children}
      </Panel>
      <div className="mt-6">
        <LanguageSwitcher />
      </div>
    </main>
  );
}
