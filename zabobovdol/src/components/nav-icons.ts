// Иконата на всеки раздел — една и съща в хедъра („Всички раздели“, мобилното
// меню), в 404 и в плочките на началната. Тонът е един (brand, през
// .icon-chip); червено (.icon-chip-danger) — само за „Пазете се от измами“.
import {
  AlertTriangle,
  Banknote,
  BookOpen,
  Bus,
  CalendarClock,
  CalendarDays,
  Camera,
  Coins,
  Cross,
  Euro,
  Flame,
  HeartHandshake,
  HeartPulse,
  HelpCircle,
  Images,
  Inbox,
  Landmark,
  Mail,
  Megaphone,
  Newspaper,
  Phone,
  Plus,
  ShieldAlert,
  Store,
  Trash2,
  Users,
  Zap,
  type LucideIcon,
} from "@/components/icons";

export const NAV_ICONS: Record<string, LucideIcon> = {
  "/kak-da": HelpCircle,
  "/uslugi": Phone,
  "/izmami": ShieldAlert,
  "/dezhurna-apteka": Cross,
  "/pomoshti": Coins,
  "/evroto": Euro,
  "/biznes": Store,
  "/sabitiya": CalendarDays,
  "/imen-den": CalendarDays,
  "/danaci-srokove": CalendarClock,
  "/grafik-smetosabirane": Trash2,
  "/obyavi": Megaphone,
  "/transport": Bus,
  "/novini": Newspaper,
  "/signali": AlertTriangle,
  "/prozrachnost": Banknote,
  "/prekysvaniya": Zap,
  "/smetishta": Trash2,
  "/grada": BookOpen,
  "/istoriya": Landmark,
  "/zov-za-pomosht": HeartHandshake,
  "/dobrovolci": Users,
  "/spomeni": Images,
  "/galeriya": Camera,
  "/pomeni": Flame,
  // „Още полезно“ (QUICK_NAV)
  "/izvestiya": Inbox,
  "/instaliraj": Plus,
  "/za-blizkite": HeartPulse,
  "/kontakti": Mail,
};

/** Иконата на раздела (резерв — „?“). */
export function navIcon(href: string): LucideIcon {
  return NAV_ICONS[href] ?? HelpCircle;
}

/** Разделите, чието квадратче е червено (цветова роля „опасност“). */
export function isDangerNav(href: string): boolean {
  return href === "/izmami";
}
