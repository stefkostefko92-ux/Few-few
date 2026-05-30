import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Badge, Button } from "../ui";
import { useAuthStore } from "../lib/store";
import { api } from "../lib/api";
import { LanguageSwitcher } from "./LanguageSwitcher";

export function Header() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  async function onLogout() {
    await api.logout().catch(() => undefined);
    setUser(null);
  }

  return (
    <header className="flex items-center justify-between gap-4 border-b border-brass-400/10 px-4 py-3 sm:px-8">
      <Link to="/" className="font-display text-2xl tracking-wide text-brass-300">
        {t("brand")}
      </Link>

      <div className="flex items-center gap-3">
        {user ? (
          <>
            <Badge tone="brass" className="tnum">
              ♟ {t("wallet.level", { level: user.level })}
            </Badge>
            <Badge tone="felt" className="tnum">
              🪙 {user.chips}
            </Badge>
            {user.vipTier !== "NONE" ? <Badge tone="vip">VIP {user.vipTier}</Badge> : null}
            <span className="hidden text-sm text-ink-300 sm:inline">{user.displayName}</span>
            <Button variant="ghost" onClick={() => void onLogout()}>
              {t("nav.logout")}
            </Button>
          </>
        ) : null}
        <LanguageSwitcher />
      </div>
    </header>
  );
}
