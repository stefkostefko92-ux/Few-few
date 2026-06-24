// Конфигурация, управляваща администраторския панел. Всеки ресурс описва
// своите полета веднъж; списъците, формите и действията се генерират от тук.
import {
  POSITION_LABELS,
  MATCH_STATUS_LABELS,
  SPONSOR_TIER_LABELS,
} from "@/lib/categories";

export type FieldType =
  | "text"
  | "textarea"
  | "markdown"
  | "select"
  | "number"
  | "boolean"
  | "datetime";

export type Field = {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: { value: string; label: string }[];
  help?: string;
  fullWidth?: boolean;
  listVisible?: boolean;
};

export type Resource = {
  key: string; // URL сегмент: /admin/<key>
  model: string; // Prisma модел (малки букви)
  labelSingular: string;
  labelPlural: string;
  titleField: string;
  slugFrom?: string;
  defaultSort?: { field: string; dir: "asc" | "desc" };
  adminOnly?: boolean; // само роля ADMIN може да управлява ресурса
  moderated?: boolean; // публикувано/скрито с филтър „чакащи"
  fields: Field[];
};

function opts(map: Record<string, string>) {
  return Object.entries(map).map(([value, label]) => ({ value, label }));
}

const seoFields: Field[] = [
  {
    name: "seoTitle",
    label: "SEO заглавие (по избор)",
    type: "text",
    help: "Ако е празно, се ползва основното заглавие.",
  },
  {
    name: "seoDescription",
    label: "SEO описание (по избор)",
    type: "textarea",
    fullWidth: true,
  },
];

export const RESOURCES: Resource[] = [
  {
    key: "novini",
    model: "post",
    labelSingular: "Новина",
    labelPlural: "Новини",
    titleField: "title",
    slugFrom: "title",
    defaultSort: { field: "publishedAt", dir: "desc" },
    moderated: true,
    fields: [
      { name: "title", label: "Заглавие", type: "text", required: true, listVisible: true },
      { name: "slug", label: "URL адрес (slug)", type: "text", help: "Оставете празно за автоматично генериране." },
      { name: "excerpt", label: "Кратко резюме", type: "textarea", fullWidth: true, help: "Показва се в списъка с новини и при споделяне." },
      { name: "coverUrl", label: "Заглавна снимка (URL)", type: "text", fullWidth: true },
      { name: "body", label: "Съдържание (Markdown)", type: "markdown", required: true, fullWidth: true },
      { name: "publishedAt", label: "Дата на публикуване", type: "datetime", listVisible: true, help: "Оставете празно — попълва се автоматично при публикуване." },
      ...seoFields,
      { name: "published", label: "Публикувано", type: "boolean", listVisible: true },
    ],
  },
  {
    key: "programa",
    model: "match",
    labelSingular: "Мач",
    labelPlural: "Програма и резултати",
    titleField: "opponent",
    defaultSort: { field: "kickoff", dir: "desc" },
    fields: [
      { name: "opponent", label: "Съперник", type: "text", required: true, listVisible: true },
      { name: "isHome", label: "Домакински мач", type: "boolean", listVisible: true },
      { name: "kickoff", label: "Начален час", type: "datetime", required: true, listVisible: true },
      { name: "competition", label: "Турнир", type: "text" },
      { name: "season", label: "Сезон", type: "text" },
      { name: "round", label: "Кръг", type: "text" },
      { name: "venue", label: "Стадион", type: "text" },
      { name: "status", label: "Статус", type: "select", options: opts(MATCH_STATUS_LABELS), listVisible: true },
      { name: "homeGoals", label: "Голове — домакин", type: "number", help: "Попълнете след края на мача." },
      { name: "awayGoals", label: "Голове — гост", type: "number" },
      { name: "ticketUrl", label: "Връзка за билети (URL)", type: "text", fullWidth: true },
      { name: "notes", label: "Бележки / репортаж (Markdown)", type: "markdown", fullWidth: true },
      { name: "published", label: "Публикувано", type: "boolean" },
    ],
  },
  {
    key: "klasirane",
    model: "standingRow",
    labelSingular: "Ред в класирането",
    labelPlural: "Класиране",
    titleField: "teamName",
    defaultSort: { field: "position", dir: "asc" },
    fields: [
      { name: "position", label: "Позиция", type: "number", required: true, listVisible: true },
      { name: "teamName", label: "Отбор", type: "text", required: true, listVisible: true },
      { name: "season", label: "Сезон", type: "text" },
      { name: "played", label: "Изиграни", type: "number" },
      { name: "won", label: "Победи", type: "number" },
      { name: "drawn", label: "Равни", type: "number" },
      { name: "lost", label: "Загуби", type: "number" },
      { name: "goalsFor", label: "Вкарани голове", type: "number" },
      { name: "goalsAgainst", label: "Допуснати голове", type: "number" },
      { name: "points", label: "Точки", type: "number", listVisible: true },
      { name: "isOwnTeam", label: "Това е нашият отбор", type: "boolean", listVisible: true },
      { name: "published", label: "Публикувано", type: "boolean" },
    ],
  },
  {
    key: "sastav",
    model: "player",
    labelSingular: "Футболист",
    labelPlural: "Състав",
    titleField: "name",
    defaultSort: { field: "order", dir: "asc" },
    fields: [
      { name: "name", label: "Име", type: "text", required: true, listVisible: true },
      { name: "number", label: "Номер", type: "number", listVisible: true },
      { name: "position", label: "Позиция", type: "select", options: opts(POSITION_LABELS), listVisible: true },
      { name: "birthDate", label: "Дата на раждане", type: "datetime" },
      { name: "heightCm", label: "Височина (см)", type: "number" },
      { name: "nationality", label: "Националност", type: "text" },
      { name: "photoUrl", label: "Снимка (URL)", type: "text", fullWidth: true },
      { name: "bio", label: "Кратко представяне (Markdown)", type: "markdown", fullWidth: true },
      { name: "active", label: "Активен състав", type: "boolean", listVisible: true },
      { name: "order", label: "Подредба", type: "number" },
    ],
  },
  {
    key: "shtab",
    model: "staff",
    labelSingular: "Член на щаба",
    labelPlural: "Треньорски щаб",
    titleField: "name",
    defaultSort: { field: "order", dir: "asc" },
    fields: [
      { name: "name", label: "Име", type: "text", required: true, listVisible: true },
      { name: "role", label: "Длъжност", type: "text", required: true, listVisible: true },
      { name: "photoUrl", label: "Снимка (URL)", type: "text", fullWidth: true },
      { name: "bio", label: "Кратко представяне (Markdown)", type: "markdown", fullWidth: true },
      { name: "order", label: "Подредба", type: "number" },
      { name: "published", label: "Публикувано", type: "boolean" },
    ],
  },
  {
    key: "istoriya",
    model: "honourItem",
    labelSingular: "Постижение / етап",
    labelPlural: "История и постижения",
    titleField: "title",
    defaultSort: { field: "order", dir: "asc" },
    fields: [
      { name: "year", label: "Година / сезон", type: "text", required: true, listVisible: true },
      { name: "title", label: "Заглавие", type: "text", required: true, listVisible: true },
      { name: "description", label: "Описание (Markdown)", type: "markdown", fullWidth: true },
      { name: "order", label: "Подредба", type: "number" },
      { name: "published", label: "Публикувано", type: "boolean" },
    ],
  },
  {
    key: "galeriya",
    model: "galleryPhoto",
    labelSingular: "Снимка",
    labelPlural: "Галерия",
    titleField: "caption",
    defaultSort: { field: "order", dir: "asc" },
    fields: [
      { name: "url", label: "Адрес на снимката (URL)", type: "text", required: true, fullWidth: true, listVisible: true },
      { name: "caption", label: "Описание", type: "text", listVisible: true },
      { name: "album", label: "Албум", type: "text", listVisible: true },
      { name: "order", label: "Подредба", type: "number" },
      { name: "published", label: "Публикувано", type: "boolean" },
    ],
  },
  {
    key: "sponsori",
    model: "sponsor",
    labelSingular: "Спонсор / партньор",
    labelPlural: "Спонсори и партньори",
    titleField: "name",
    defaultSort: { field: "order", dir: "asc" },
    fields: [
      { name: "name", label: "Име", type: "text", required: true, listVisible: true },
      { name: "logoUrl", label: "Лого (URL)", type: "text", fullWidth: true },
      { name: "url", label: "Уебсайт (URL)", type: "text", fullWidth: true },
      { name: "tier", label: "Ниво", type: "select", options: opts(SPONSOR_TIER_LABELS), listVisible: true },
      { name: "order", label: "Подредба", type: "number" },
      { name: "published", label: "Публикувано", type: "boolean" },
    ],
  },
];

export function getResource(key: string): Resource | undefined {
  return RESOURCES.find((r) => r.key === key);
}
