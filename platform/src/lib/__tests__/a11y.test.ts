import { test } from "node:test";
import assert from "node:assert/strict";
import { auditBlocks, a11ySummary } from "@/lib/a11y";
import type { Block } from "@/lib/blocks";

test("снимка без alt → грешка 1.1.1", () => {
  const blocks: Block[] = [
    { id: "1", type: "image", url: "https://x/y.jpg", alt: "", align: "center", rounded: false },
  ];
  const issues = auditBlocks(blocks);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].severity, "error");
  assert.match(issues[0].wcag, /1\.1\.1/);
});

test("снимка с alt → няма проблем; празен url се пропуска", () => {
  const blocks: Block[] = [
    { id: "1", type: "image", url: "https://x/y.jpg", alt: "Описание", align: "center", rounded: false },
    { id: "2", type: "image", url: "", alt: "", align: "center", rounded: false },
  ];
  assert.equal(auditBlocks(blocks).length, 0);
});

test("бутон с връзка без надпис → грешка 2.4.4", () => {
  const blocks: Block[] = [
    { id: "1", type: "button", label: " ", href: "https://x", align: "left", variant: "primary" },
  ];
  const issues = auditBlocks(blocks);
  assert.ok(issues.some((i) => i.wcag.startsWith("2.4.4") && i.severity === "error"));
});

test("неясен текст на връзка → внимание 2.4.4", () => {
  const blocks: Block[] = [
    { id: "1", type: "button", label: "тук", href: "https://x", align: "left", variant: "primary" },
  ];
  const issues = auditBlocks(blocks);
  assert.ok(issues.some((i) => i.wcag.startsWith("2.4.4") && i.severity === "warning"));
});

test("прескочено ниво на заглавие H1→H3 → внимание", () => {
  const blocks: Block[] = [
    { id: "1", type: "heading", level: 1, text: "Заглавие", align: "left" },
    { id: "2", type: "heading", level: 3, text: "Подзаглавие", align: "left" },
  ];
  const issues = auditBlocks(blocks);
  assert.ok(issues.some((i) => i.message.includes("Прескочено ниво")));
});

test("страница със заглавия, но без H1 → внимание", () => {
  const blocks: Block[] = [
    { id: "1", type: "heading", level: 2, text: "Секция", align: "left" },
  ];
  const issues = auditBlocks(blocks);
  assert.ok(issues.some((i) => i.message.includes("H1")));
});

test("хиро (H2) + H1 heading → без грешка за липсващ H1", () => {
  const blocks: Block[] = [
    { id: "1", type: "heading", level: 1, text: "Главно", align: "left" },
    { id: "2", type: "hero", title: "Добре дошли", subtitle: "", align: "center", buttonLabel: "Виж", buttonHref: "https://x" },
  ];
  const issues = auditBlocks(blocks);
  assert.ok(!issues.some((i) => i.message.includes("няма главно заглавие")));
});

test("a11ySummary брои грешки и предупреждения", () => {
  const blocks: Block[] = [
    { id: "1", type: "image", url: "https://x/y.jpg", alt: "", align: "center", rounded: false },
    { id: "2", type: "heading", level: 2, text: "Секция", align: "left" },
  ];
  const { errors, warnings } = a11ySummary(auditBlocks(blocks));
  assert.equal(errors, 1);
  assert.ok(warnings >= 1);
});
