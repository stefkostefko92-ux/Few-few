// frontend/src/components/dashboardNav.js
// Навигацията на таблото — подредена ПО ЗАДАЧИ (решение на собственика,
// 12.11.2026): какво върши човекът, а не как е построен ботът.
//
//   Преглед
//   Поддръжка          — тикети, панели, формуляри, кандидатури, готови отговори, база знания
//   Защита             — верификация, канал-стръв, дневник
//   Общност            — посрещане и роли, анкети и раздавания, съобщения, игра
//   Данни и интеграции — анализи, webhooks, API ключове
//   Сървър             — настройки, Premium, команди, помощ
//
// Преди: „Автоматизация“ държеше и играта, и готовите отговори; стръвта беше
// карта във „Верификация“, запазването на роли — отметка на дъното на
// „Настройки“, а webhooks имаха две страници.
//
// Един източник за страничната лента и за търсенето в горната лента — иначе
// двете рано или късно се разминават. `search` са разделите вътре в страницата:
// не се показват в лентата, но търсенето води право в тях.
import {
  LayoutDashboard, Ticket, FileText, Layout as LayoutIcon, Users, ShieldCheck, Gamepad2,
  MessageSquareText, Webhook, Lightbulb, LineChart, BookOpen, Settings, Key, Star, LifeBuoy,
  Fish, ScrollText, UserPlus, BarChart3, Megaphone,
} from "lucide-react";

import { SUPPORT_URL } from "../lib/support";

/** Групите за сървъра `serverId`; `t` е преводачът на таблото. */
export function buildServerNav(serverId, t) {
  const base = `/dashboard/${serverId}`;
  return [
    {
      key: "main",
      items: [
        { to: base, icon: LayoutDashboard, label: t("nav.overview"), end: true },
      ],
    },
    {
      key: "support",
      label: t("nav.group.support"),
      items: [
        { to: `${base}/tickets`, icon: Ticket, label: t("nav.tickets") },
        { to: `${base}/panels`, icon: LayoutIcon, label: t("nav.panels") },
        { to: `${base}/forms`, icon: FileText, label: t("nav.forms") },
        { to: `${base}/applications`, icon: Users, label: t("nav.applications") },
        { to: `${base}/tags`, icon: MessageSquareText, label: t("nav.tags") },
        {
          to: `${base}/kb`, icon: Lightbulb, label: t("nav.knowledgeBase"),
          search: [{ to: `${base}/kb?tab=ai`, label: t("settings.ai.title") }],
        },
      ],
    },
    {
      key: "protection",
      label: t("nav.group.protection"),
      items: [
        { to: `${base}/verification`, icon: ShieldCheck, label: t("nav.verification") },
        { to: `${base}/bait`, icon: Fish, label: t("nav.bait") },
        { to: `${base}/activity-log`, icon: ScrollText, label: t("nav.activityLog") },
      ],
    },
    {
      key: "community",
      label: t("nav.group.community"),
      items: [
        {
          to: `${base}/welcome`, icon: UserPlus, label: t("nav.welcomeRoles"),
          search: [
            { to: `${base}/welcome?tab=autoroles`, label: t("welcome.autoroles.title") },
            { to: `${base}/welcome?tab=role-saver`, label: t("roleSaver.title") },
            { to: `${base}/welcome?tab=reaction-roles`, label: t("auto.tab.reactionRoles") },
          ],
        },
        {
          to: `${base}/polls`, icon: BarChart3, label: t("nav.pollsGiveaways"),
          search: [{ to: `${base}/polls?tab=giveaways`, label: t("auto.tab.giveaways") }],
        },
        {
          to: `${base}/messages`, icon: Megaphone, label: t("nav.messages"),
          search: [
            { to: `${base}/messages`, label: t("auto.sticky.title") },
            { to: `${base}/messages?tab=scheduled`, label: t("auto.sched.title") },
          ],
        },
        { to: `${base}/game`, icon: Gamepad2, label: t("nav.game") },
      ],
    },
    {
      key: "data",
      label: t("nav.group.data"),
      items: [
        { to: `${base}/analytics`, icon: LineChart, label: t("nav.analytics") },
        { to: `${base}/webhooks`, icon: Webhook, label: t("nav.webhooks") },
        { to: `${base}/apikeys`, icon: Key, label: t("nav.apikeys") },
      ],
    },
    {
      key: "server",
      label: t("nav.group.server"),
      items: [
        {
          to: `${base}/settings`, icon: Settings, label: t("nav.settings"),
          search: [
            { to: `${base}/settings`, label: t("language.botForServer") },
            { to: `${base}/settings`, label: t("settings.rr.title") },
            { to: `${base}/settings`, label: t("settings.wl.title") },
          ],
        },
        { to: `${base}/premium`, icon: Star, label: t("nav.premium"), premium: true },
        { to: `${base}/commands`, icon: BookOpen, label: t("nav.commands") },
        { href: SUPPORT_URL, icon: LifeBuoy, label: t("nav.support"), external: true },
      ],
    },
  ];
}

/**
 * Какво намира търсенето в горната лента: страниците и разделите в тях.
 * Раздел се показва като „Страница › Раздел“ с иконата на страницата си.
 */
export function buildSearchIndex(groups) {
  return groups.flatMap((g) => g.items).flatMap((it) => [
    it,
    ...(it.search || []).map((s) => ({ ...s, icon: it.icon, label: `${it.label} › ${s.label}` })),
  ]);
}
