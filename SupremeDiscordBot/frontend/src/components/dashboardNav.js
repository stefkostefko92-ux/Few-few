// frontend/src/components/dashboardNav.js
// Навигацията на таблото — групирана по одобрената концепция (10.10.2026):
// основните страници без заглавие, после „Автоматизация“, „Знание и анализи“ и
// „Конфигурация“. Един източник за страничната лента и за търсенето в горната
// лента — иначе двете рано или късно се разминават.
import {
  LayoutDashboard, Ticket, FileText, Layout as LayoutIcon, Users, ShieldCheck, Zap, Gamepad2,
  MessageSquareText, Webhook, Lightbulb, LineChart, BookOpen, Settings, Key, Star, LifeBuoy,
} from "lucide-react";

export const SUPPORT_URL = import.meta.env.VITE_SUPPORT_URL || "https://discord.gg/wpCRpy8B";

/** Групите за сървъра `serverId`; `t` е преводачът на таблото. */
export function buildServerNav(serverId, t) {
  const base = `/dashboard/${serverId}`;
  return [
    {
      key: "main",
      items: [
        { to: base, icon: LayoutDashboard, label: t("nav.overview"), end: true },
        { to: `${base}/tickets`, icon: Ticket, label: t("nav.tickets") },
        { to: `${base}/panels`, icon: LayoutIcon, label: t("nav.panels") },
        { to: `${base}/forms`, icon: FileText, label: t("nav.forms") },
        { to: `${base}/applications`, icon: Users, label: t("nav.applications") },
        { to: `${base}/verification`, icon: ShieldCheck, label: t("nav.verification") },
      ],
    },
    {
      key: "automation",
      label: t("nav.group.automation"),
      items: [
        { to: `${base}/automation`, icon: Zap, label: t("nav.automation") },
        { to: `${base}/game`, icon: Gamepad2, label: t("nav.game") },
        { to: `${base}/tags`, icon: MessageSquareText, label: t("nav.tags") },
        { to: `${base}/webhooks`, icon: Webhook, label: t("nav.webhooks") },
      ],
    },
    {
      key: "intelligence",
      label: t("nav.group.intelligence"),
      items: [
        { to: `${base}/kb`, icon: Lightbulb, label: t("nav.knowledgeBase") },
        { to: `${base}/analytics`, icon: LineChart, label: t("nav.analytics") },
        { to: `${base}/commands`, icon: BookOpen, label: t("nav.commands") },
      ],
    },
    {
      key: "config",
      label: t("nav.group.config"),
      items: [
        { to: `${base}/settings`, icon: Settings, label: t("nav.settings") },
        { to: `${base}/apikeys`, icon: Key, label: t("nav.apikeys") },
        { to: `${base}/premium`, icon: Star, label: t("nav.premium"), premium: true },
        { href: SUPPORT_URL, icon: LifeBuoy, label: t("nav.support"), external: true },
      ],
    },
  ];
}
