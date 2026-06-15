// Конфигурация, управляваща администраторския панел. Всеки ресурс описва
// своите полета веднъж; списъците, формите и действията се генерират от тук.
import {
  SERVICE_CATEGORY_LABELS,
  BUSINESS_CATEGORY_LABELS,
  LISTING_TYPE_LABELS,
  HELP_KIND_LABELS,
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
  fields: Field[];
};

function opts(map: Record<string, string>) {
  return Object.entries(map).map(([value, label]) => ({ value, label }));
}

const seoFields: Field[] = [
  { name: "seoTitle", label: "SEO заглавие (по избор)", type: "text", help: "Ако е празно, се ползва основното заглавие." },
  { name: "seoDescription", label: "SEO описание (по избор)", type: "textarea", fullWidth: true },
];

export const RESOURCES: Resource[] = [
  {
    key: "faq",
    model: "faq",
    labelSingular: "Въпрос „Как да…“",
    labelPlural: "Как да… (въпроси)",
    titleField: "question",
    slugFrom: "question",
    defaultSort: { field: "order", dir: "asc" },
    fields: [
      { name: "question", label: "Въпрос", type: "text", required: true, listVisible: true },
      { name: "slug", label: "URL адрес (slug)", type: "text", help: "Оставете празно за автоматично генериране." },
      { name: "category", label: "Категория", type: "text", listVisible: true },
      { name: "answer", label: "Отговор (Markdown)", type: "markdown", required: true, fullWidth: true },
      { name: "steps", label: "Стъпки (по една на ред)", type: "textarea", fullWidth: true, help: "Всеки ред е отделна стъпка." },
      { name: "relatedLinks", label: "Полезни връзки", type: "textarea", fullWidth: true, help: "Формат: Етикет|https://... на отделен ред." },
      { name: "tags", label: "Етикети (запетая)", type: "text" },
      ...seoFields,
      { name: "order", label: "Подредба", type: "number" },
      { name: "published", label: "Публикувано", type: "boolean", listVisible: true },
    ],
  },
  {
    key: "services",
    model: "service",
    labelSingular: "Услуга / телефон",
    labelPlural: "Услуги и телефони",
    titleField: "name",
    slugFrom: "name",
    defaultSort: { field: "order", dir: "asc" },
    fields: [
      { name: "name", label: "Име", type: "text", required: true, listVisible: true },
      { name: "slug", label: "URL адрес (slug)", type: "text" },
      { name: "category", label: "Категория", type: "select", options: opts(SERVICE_CATEGORY_LABELS), listVisible: true },
      { name: "isEmergency", label: "Спешен телефон", type: "boolean" },
      { name: "description", label: "Описание (Markdown)", type: "markdown", fullWidth: true },
      { name: "address", label: "Адрес", type: "text" },
      { name: "phone", label: "Телефон", type: "text", listVisible: true },
      { name: "phone2", label: "Втори телефон", type: "text" },
      { name: "email", label: "Имейл", type: "text" },
      { name: "website", label: "Уебсайт", type: "text" },
      { name: "hours", label: "Работно време", type: "text" },
      { name: "lat", label: "Гео ширина (lat)", type: "number" },
      { name: "lng", label: "Гео дължина (lng)", type: "number" },
      ...seoFields,
      { name: "order", label: "Подредба", type: "number" },
      { name: "published", label: "Публикувано", type: "boolean", listVisible: true },
    ],
  },
  {
    key: "business",
    model: "business",
    labelSingular: "Бизнес",
    labelPlural: "Местен бизнес",
    titleField: "name",
    slugFrom: "name",
    defaultSort: { field: "order", dir: "asc" },
    fields: [
      { name: "name", label: "Име", type: "text", required: true, listVisible: true },
      { name: "slug", label: "URL адрес (slug)", type: "text" },
      { name: "category", label: "Категория", type: "select", options: opts(BUSINESS_CATEGORY_LABELS), listVisible: true },
      { name: "featured", label: "Препоръчано", type: "boolean", listVisible: true },
      { name: "description", label: "Описание (Markdown)", type: "markdown", fullWidth: true },
      { name: "address", label: "Адрес", type: "text" },
      { name: "phone", label: "Телефон", type: "text" },
      { name: "email", label: "Имейл", type: "text" },
      { name: "website", label: "Уебсайт", type: "text" },
      { name: "facebook", label: "Facebook", type: "text" },
      { name: "hours", label: "Работно време", type: "text" },
      { name: "lat", label: "Гео ширина (lat)", type: "number" },
      { name: "lng", label: "Гео дължина (lng)", type: "number" },
      ...seoFields,
      { name: "order", label: "Подредба", type: "number" },
      { name: "published", label: "Публикувано", type: "boolean", listVisible: true },
    ],
  },
  {
    key: "events",
    model: "event",
    labelSingular: "Събитие",
    labelPlural: "Събития",
    titleField: "title",
    slugFrom: "title",
    defaultSort: { field: "startAt", dir: "desc" },
    fields: [
      { name: "title", label: "Заглавие", type: "text", required: true, listVisible: true },
      { name: "slug", label: "URL адрес (slug)", type: "text" },
      { name: "startAt", label: "Начало", type: "datetime", required: true, listVisible: true },
      { name: "endAt", label: "Край", type: "datetime" },
      { name: "location", label: "Място", type: "text" },
      { name: "address", label: "Адрес", type: "text" },
      { name: "organizer", label: "Организатор", type: "text" },
      { name: "url", label: "Външна връзка", type: "text" },
      { name: "description", label: "Описание (Markdown)", type: "markdown", fullWidth: true },
      { name: "lat", label: "Гео ширина (lat)", type: "number" },
      { name: "lng", label: "Гео дължина (lng)", type: "number" },
      ...seoFields,
      { name: "published", label: "Публикувано", type: "boolean", listVisible: true },
    ],
  },
  {
    key: "listings",
    model: "listing",
    labelSingular: "Обява",
    labelPlural: "Обяви",
    titleField: "title",
    slugFrom: "title",
    defaultSort: { field: "createdAt", dir: "desc" },
    fields: [
      { name: "title", label: "Заглавие", type: "text", required: true, listVisible: true },
      { name: "slug", label: "URL адрес (slug)", type: "text" },
      { name: "type", label: "Вид", type: "select", options: opts(LISTING_TYPE_LABELS), listVisible: true },
      { name: "category", label: "Категория", type: "text" },
      { name: "price", label: "Цена", type: "text" },
      { name: "description", label: "Описание (Markdown)", type: "markdown", fullWidth: true },
      { name: "contactName", label: "Лице за контакт", type: "text" },
      { name: "contactPhone", label: "Телефон", type: "text" },
      { name: "contactEmail", label: "Имейл", type: "text" },
      { name: "expiresAt", label: "Валидна до", type: "datetime" },
      { name: "published", label: "Публикувано (одобрено)", type: "boolean", listVisible: true },
    ],
  },
  {
    key: "banners",
    model: "banner",
    labelSingular: "Рекламен банер",
    labelPlural: "Реклами (банери)",
    titleField: "title",
    defaultSort: { field: "order", dir: "asc" },
    fields: [
      { name: "title", label: "Заглавие", type: "text", required: true, listVisible: true },
      { name: "sponsor", label: "Рекламодател", type: "text", listVisible: true },
      { name: "description", label: "Кратък текст", type: "textarea", fullWidth: true },
      { name: "imageUrl", label: "Изображение (URL, по избор)", type: "text", help: "Препоръчителен размер около 600×320 px. Ако е празно, се показва текстов банер." },
      { name: "linkUrl", label: "Връзка (накъде води при натискане)", type: "text", help: "Напр. https://... или вътрешен адрес като /reklama." },
      { name: "bgColor", label: "Цвят на фона (за текстов банер)", type: "text", help: "Напр. #000000. Ако е празно, се ползва основният цвят на сайта." },
      { name: "accentColor", label: "Акцентен цвят", type: "text", help: "Напр. #00e5ff (за рекламодателя/детайлите)." },
      { name: "order", label: "Подредба (1–4)", type: "number" },
      { name: "published", label: "Активен", type: "boolean", listVisible: true },
    ],
  },
  {
    key: "posts",
    model: "post",
    labelSingular: "Новина",
    labelPlural: "Новини",
    titleField: "title",
    slugFrom: "title",
    defaultSort: { field: "createdAt", dir: "desc" },
    fields: [
      { name: "title", label: "Заглавие", type: "text", required: true, listVisible: true },
      { name: "slug", label: "URL адрес (slug)", type: "text" },
      { name: "excerpt", label: "Кратко резюме", type: "textarea", fullWidth: true },
      { name: "content", label: "Съдържание (Markdown)", type: "markdown", fullWidth: true },
      { name: "coverImage", label: "Заглавно изображение (URL)", type: "text" },
      { name: "publishedAt", label: "Дата на публикуване", type: "datetime" },
      ...seoFields,
      { name: "published", label: "Публикувано", type: "boolean", listVisible: true },
    ],
  },
  {
    key: "help",
    model: "helpCause",
    labelSingular: "Кауза (Зов за помощ)",
    labelPlural: "Зов за помощ",
    titleField: "title",
    slugFrom: "title",
    defaultSort: { field: "createdAt", dir: "desc" },
    fields: [
      { name: "title", label: "Заглавие", type: "text", required: true, listVisible: true },
      { name: "slug", label: "URL адрес (slug)", type: "text" },
      { name: "kind", label: "Вид", type: "select", options: Object.entries(HELP_KIND_LABELS).map(([value, label]) => ({ value, label })), listVisible: true },
      { name: "beneficiary", label: "За кого е помощта", type: "text" },
      { name: "location", label: "Място / квартал", type: "text" },
      { name: "description", label: "Описание (Markdown)", type: "markdown", required: true, fullWidth: true },
      { name: "contactName", label: "Лице за контакт", type: "text" },
      { name: "contactPhone", label: "Телефон", type: "text" },
      { name: "contactEmail", label: "Имейл", type: "text" },
      { name: "published", label: "Публикувано (одобрено)", type: "boolean", listVisible: true },
    ],
  },
  {
    key: "spomeni",
    model: "memory",
    labelSingular: "Спомен",
    labelPlural: "Спомени",
    titleField: "title",
    slugFrom: "title",
    defaultSort: { field: "createdAt", dir: "desc" },
    fields: [
      { name: "title", label: "Заглавие", type: "text", required: true, listVisible: true },
      { name: "slug", label: "URL адрес (slug)", type: "text" },
      { name: "author", label: "Автор (по избор)", type: "text", listVisible: true },
      { name: "period", label: "Период (напр. 1980-те)", type: "text" },
      { name: "content", label: "Спомен (Markdown)", type: "markdown", required: true, fullWidth: true },
      { name: "imageUrl", label: "Стара снимка (URL, по избор)", type: "text" },
      { name: "published", label: "Публикувано (одобрено)", type: "boolean", listVisible: true },
    ],
  },
];

export function getResource(key: string): Resource | undefined {
  return RESOURCES.find((r) => r.key === key);
}
