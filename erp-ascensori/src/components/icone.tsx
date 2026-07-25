"use client";

// Единствената врата към иконографията на продукта.
//
// Причината да е централизирано: преди това интерфейсът ползваше текстови
// глифове (✕ ← → ↑ ↓ ✓ ⚠ +) като икони. Системният шрифт ги рисува различно на
// Windows, macOS и Linux — различна дебелина, различно седене спрямо базовата
// линия, а част от тях изобщо липсват в някои шрифтове и се рендерират като
// празно квадратче. За продукт, който се продава, това е недопустимо.
//
// Иконите са Phosphor Icons (MIT) — истински, безплатен сет, вече в зависимостите.
// Нищо не е рисувано на ръка.
//
// ТРИ ПРАВИЛА, които не се нарушават:
//   1. Дебелина по РОЛЯ: regular = навигация/декор · bold = действие ·
//      fill = статус-сигнал (успех/грешка/внимание).
//   2. Размер само от скалата: 12 (вътре в текст) · 14 (вътре в таблица/дребен
//      бутон) · 16 (бутон с текст) · 18 (самостоятелна икона в навигацията).
//   3. Иконата НИКОГА не носи смисъл сама: или има видим текст до нея, или
//      `aria-hidden` + `sr-only` текст. Цветът също не е сигнал сам по себе си.

import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowsHorizontal,
  CaretLeft,
  CaretRight,
  Check,
  DownloadSimple,
  CheckCircle,
  Plus,
  QrCode,
  Printer,
  Tray,
  WarningCircle,
  X,
  XCircle,
} from "@phosphor-icons/react";

/** Каноничната скала. Междинни стойности не съществуват. */
export const DIM = {
  testo: 12,
  tabella: 14,
  bottone: 16,
  navigazione: 18,
} as const;

// ── Действия (bold) ─────────────────────────────────────────────────────────

export const IcoNuovo = () => <Plus size={DIM.bottone} weight="bold" aria-hidden />;
export const IcoNuovoPiccolo = () => <Plus size={DIM.tabella} weight="bold" aria-hidden />;
export const IcoStampa = () => <Printer size={DIM.tabella} weight="bold" aria-hidden />;
/** Етикетът с код за сканиране върху машината. */
export const IcoQr = () => <QrCode size={DIM.tabella} weight="bold" aria-hidden />;
/** Изнасяне на файл (XML за SDI) — различно действие от печата. */
export const IcoEsporta = () => <DownloadSimple size={DIM.tabella} weight="bold" aria-hidden />;
export const IcoChiudi = () => <X size={DIM.bottone} weight="bold" aria-hidden />;
export const IcoSu = () => <ArrowUp size={DIM.bottone} weight="bold" aria-hidden />;
export const IcoGiu = () => <ArrowDown size={DIM.bottone} weight="bold" aria-hidden />;
export const IcoLarghezza = () => <ArrowsHorizontal size={DIM.tabella} weight="bold" aria-hidden />;
export const IcoTransizione = () => <ArrowRight size={DIM.tabella} weight="bold" aria-hidden />;

// ── Навигация (regular) ─────────────────────────────────────────────────────

export const IcoIndietro = () => <ArrowLeft size={DIM.tabella} aria-hidden />;
/** Листането е ДРУГО от навигацията — оттам различният знак. */
export const IcoPrecedente = () => <CaretLeft size={DIM.tabella} weight="bold" aria-hidden />;
export const IcoSuccessiva = () => <CaretRight size={DIM.tabella} weight="bold" aria-hidden />;
/** Разделител между две стойности („от → до", „статус → статус"). */
export const IcoVerso = () => <ArrowRight size={DIM.testo} className="shrink-0" aria-hidden />;

// ── Статус (fill) ───────────────────────────────────────────────────────────

export const IcoIntegro = () => (
  <CheckCircle size={DIM.tabella} weight="fill" className="text-success-text" aria-hidden />
);
export const IcoAlterato = () => (
  <XCircle size={DIM.tabella} weight="fill" className="text-danger-text" aria-hidden />
);
export const IcoAttenzione = () => (
  <WarningCircle size={DIM.tabella} weight="fill" className="text-danger-text" aria-hidden />
);
export const IcoFatto = () => (
  <Check size={DIM.testo} weight="bold" className="text-success-text" aria-hidden />
);
export const IcoVuoto = () => (
  <Tray size={32} className="text-text-3" aria-hidden />
);
