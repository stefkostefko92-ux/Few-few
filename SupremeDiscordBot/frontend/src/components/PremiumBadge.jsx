// frontend/src/components/PremiumBadge.jsx
import { Star, Lock } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { useT } from "../contexts/I18nContext";

/**
 * Small inline badge — use next to a feature label to show it's Premium-only.
 *   <span>Observer roles <PremiumBadge /></span>
 */
export function PremiumBadge({ small = false }) {
  const { t } = useT();
  if (small) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-cs-gold/10 text-cs-gold text-[9px] font-bold uppercase tracking-wider border border-cs-gold/30">
        <Star className="w-2.5 h-2.5 fill-current" />
        {t("premium.badge")}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-cs-gold/10 text-cs-gold text-[10px] font-bold uppercase tracking-wider border border-cs-gold/30">
      <Star className="w-3 h-3 fill-current" />
      {t("premium.badge")}
    </span>
  );
}

/**
 * Wrap any input/section. When `locked=true`, overlays a semi-transparent
 * lock with "Upgrade" link to premium page. Content is still visible but
 * pointer-events are disabled.
 */
export function PremiumGate({ locked, feature, children, className = "" }) {
  const { serverId } = useParams();
  const { t } = useT();
  if (!locked) return children;

  return (
    <div className={`relative ${className}`}>
      <div className="opacity-40 pointer-events-none select-none">{children}</div>
      <div className="absolute inset-0 flex items-center justify-center bg-cs-black/40 backdrop-blur-[1px] rounded-lg">
        <Link
          to={`/dashboard/${serverId}/premium`}
          className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-cs-gold/20 hover:bg-cs-gold/30 text-cs-gold text-xs font-bold uppercase tracking-wider border border-cs-gold/40 transition-colors"
        >
          <Lock className="w-3 h-3" />
          {feature ? t("premium.upgradeTo", { feature }) : t("premium.required")}
        </Link>
      </div>
    </div>
  );
}

/**
 * Full-card premium lock — use when the entire feature area should be gated.
 */
export function PremiumLockCard({ feature, description }) {
  const { serverId } = useParams();
  const { t } = useT();
  return (
    <div className="cs-card border-cs-gold/30 bg-cs-gold/5 text-center py-10">
      <Lock className="w-10 h-10 text-cs-gold mx-auto mb-3" />
      <h3 className="text-cs-text font-bold text-lg mb-2">{t("premium.feature")}</h3>
      <p className="text-cs-muted text-sm max-w-md mx-auto mb-4">
        {description || t("premium.featureAvailable", { feature })}
      </p>
      <Link
        to={`/dashboard/${serverId}/premium`}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-cs-gold hover:bg-cs-goldDim text-black text-xs font-bold uppercase tracking-wider transition-colors"
      >
        <Star className="w-3 h-3 fill-current" />
        {t("premium.upgradeToPremium")}
      </Link>
    </div>
  );
}
