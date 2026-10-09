// frontend/src/components/FeatureLinks.jsx
// Футър-навигация към /features/* — ЕДНО определение за английската и за
// седемте локализирани начални страници (и снимката в prerender.mjs чете
// същия масив). Съдържанието на страниците е на английски; заглавието на реда
// идва на езика на посетителя (t.guides.features), етикетите са кратките
// английски имена от FEATURE_PAGES.nav. Без този ред страниците са сираци —
// търсачката ги знае от sitemap-а, човекът не (noOrphanPages.test.js).
import { FEATURES_HUB, FEATURE_PAGES } from "../data/featurePages";

export default function FeatureLinks({ heading = "Features", uppercase = false }) {
  const cls = `hover:text-cs-cyan transition-colors${uppercase ? " uppercase" : ""}`;
  return (
    <nav aria-label={heading}
         className="flex flex-wrap items-center justify-center gap-4 font-mono text-[10px] text-cs-dim border-t border-cs-border/30 pt-4">
      <span className="text-cs-muted uppercase tracking-[0.15em]">{heading}</span>
      {FEATURE_PAGES.map((p) => (
        <a key={p.path} href={p.path} className={cls}>{p.nav}</a>
      ))}
      <a href={FEATURES_HUB.path} className={`${cls} text-cs-cyan`}>{FEATURES_HUB.nav}</a>
    </nav>
  );
}
