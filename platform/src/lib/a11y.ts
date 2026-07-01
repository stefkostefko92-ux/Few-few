import type { Block } from "@/lib/blocks";

// Вграден проверител за достъпност (WCAG 2.1 AA / EN 301 549). Чиста функция
// над списъка блокове — върти се и в конструктора (клиент), и на сървъра.
// Целта е държавно ниво на достъпност по подразбиране: авторът вижда проблемите
// още преди публикуване, с точна препратка към критерия.

export type A11ySeverity = "error" | "warning";

export type A11yIssue = {
  severity: A11ySeverity;
  blockId?: string;
  wcag: string; // напр. „1.1.1 (A)"
  message: string;
};

// Общи (неинформативни) текстове на връзки — SC 2.4.4.
const VAGUE_LINK_TEXT = [
  "тук",
  "натисни тук",
  "кликни тук",
  "кликнете тук",
  "прочети повече",
  "прочетете повече",
  "виж повече",
  "повече",
  "линк",
  "click here",
  "read more",
  "here",
];

function headingLevelOf(b: Block): number | null {
  if (b.type === "heading") return b.level;
  if (b.type === "hero") return 2; // хиро секцията се рендира като <h2>
  return null;
}

export function auditBlocks(blocks: Block[]): A11yIssue[] {
  const issues: A11yIssue[] = [];

  // 1.1.1 (A) — текстова алтернатива за изображения.
  for (const b of blocks) {
    if (b.type === "image" && b.url && !b.alt.trim()) {
      issues.push({
        severity: "error",
        blockId: b.id,
        wcag: "1.1.1 (A)",
        message: "Снимка без описание (alt). Добавете кратко описание или го оставете празно само ако е чисто декоративна.",
      });
    }
    if (b.type === "gallery") {
      const missing = b.images.filter((im) => im.url && !im.alt.trim()).length;
      if (missing > 0) {
        issues.push({
          severity: "warning",
          blockId: b.id,
          wcag: "1.1.1 (A)",
          message: `Галерия: ${missing} снимк${missing === 1 ? "а" : "и"} без описание (alt).`,
        });
      }
    }
  }

  // 2.4.4 (A) — смислен текст на връзки и бутони.
  for (const b of blocks) {
    if (b.type === "button" && b.href && !b.label.trim()) {
      issues.push({
        severity: "error",
        blockId: b.id,
        wcag: "2.4.4 (A)",
        message: "Бутон с връзка, но без надпис.",
      });
    }
    const labels: string[] = [];
    if (b.type === "button") labels.push(b.label);
    if (b.type === "hero") labels.push(b.buttonLabel);
    for (const l of labels) {
      if (l && VAGUE_LINK_TEXT.includes(l.trim().toLowerCase())) {
        issues.push({
          severity: "warning",
          blockId: b.id,
          wcag: "2.4.4 (A)",
          message: `Неясен текст на връзка („${l.trim()}"). Опишете накъде води връзката.`,
        });
      }
    }
  }

  // 1.3.1 / 2.4.6 — йерархия на заглавията (има H1, без прескачане на нива).
  const headings = blocks
    .map((b) => ({ id: b.id, level: headingLevelOf(b) }))
    .filter((h): h is { id: string; level: number } => h.level !== null);

  const h1s = headings.filter((h) => h.level === 1);
  if (headings.length > 0 && h1s.length === 0) {
    issues.push({
      severity: "warning",
      wcag: "2.4.6 (AA)",
      message: "Страницата няма главно заглавие (H1). Добавете едно заглавие на ниво H1.",
    });
  }
  if (h1s.length > 1) {
    issues.push({
      severity: "warning",
      blockId: h1s[1].id,
      wcag: "1.3.1 (A)",
      message: "Повече от едно главно заглавие (H1) на страницата.",
    });
  }
  for (let i = 1; i < headings.length; i++) {
    if (headings[i].level > headings[i - 1].level + 1) {
      issues.push({
        severity: "warning",
        blockId: headings[i].id,
        wcag: "1.3.1 (A)",
        message: `Прескочено ниво на заглавие (H${headings[i - 1].level} → H${headings[i].level}).`,
      });
    }
  }

  // 1.3.1 — таблица с цени/отзиви без заглавие над секцията е ок (имат структура),
  // но празна страница-форма без заглавие подсказваме леко.
  return issues;
}

export function a11ySummary(issues: A11yIssue[]): {
  errors: number;
  warnings: number;
} {
  return {
    errors: issues.filter((i) => i.severity === "error").length,
    warnings: issues.filter((i) => i.severity === "warning").length,
  };
}
