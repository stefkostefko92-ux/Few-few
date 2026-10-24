import test from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PageMeta } from "@/components/ui";

// Компонентите се компилират с класическия JSX (React.createElement) —
// при рендиране извън Next им трябва глобален React.
(globalThis as { React?: typeof React }).React = React;

const NB = "\u00a0";
// 23:30 UTC на 29.10 — в София (UTC+2) вече е 30.10.
const LATE = new Date("2026-10-29T23:30:00Z");

function render(props: Parameters<typeof PageMeta>[0]): string {
  return renderToStaticMarkup(React.createElement(PageMeta, props));
}

test("PageMeta: reviewed с wall се показва както е въведено от админа", () => {
  const html = render({ reviewed: LATE, wall: true });
  assert.match(html, /Проверено на /);
  assert.match(html, new RegExp(`29${NB}октомври 2026${NB}г\\.`));
  assert.match(html, /dateTime="2026-10-29"/);
});

test("PageMeta: без wall датата е истински момент по часа на София", () => {
  const html = render({ reviewed: LATE });
  assert.match(html, new RegExp(`30${NB}октомври 2026${NB}г\\.`));
  assert.match(html, /dateTime="2026-10-30"/);
});

test("PageMeta: wall не важи за резервното updated (updatedAt е момент)", () => {
  const html = render({ reviewed: null, updated: LATE, wall: true });
  assert.match(html, /Последна редакция: /);
  assert.match(html, /dateTime="2026-10-30"/);
});

test("PageMeta: без дата и източници не рисува нищо", () => {
  assert.equal(render({}), "");
  assert.match(render({ sources: ["НОИ", "АСП"] }), /Източници: НОИ, АСП/);
});
