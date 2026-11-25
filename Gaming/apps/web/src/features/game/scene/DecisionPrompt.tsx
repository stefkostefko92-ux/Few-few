import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useMatchStore } from "../../../lib/store";
import { useSettings } from "../../../lib/settings";
import "./decision.css";

/**
 * Изскачащ прозорец за РЕШЕНИЕ — всеки момент, в който играчът трябва да избере
 * нещо, а не просто да изиграе карта/ход: обявяване на коз или наддаване,
 * „20/40“, „Имам 66“, „Купи“, обявен джоб, избор на фигура при повишаване…
 *
 * Преди изборите бяха редове с бутони под масата — на лаптоп и на телефон
 * често извън екрана, и играчът „се чудеше откъде да обяви“. Сега прозорецът
 * идва сам, когато решението е на ред, с часовника на хода вътре.
 *
 *  - НЕ е модален: няма фон, масата и ръката се виждат (решението се взема
 *    по картите), а при `optional` ръката може и да се играе.
 *  - „Виж масата“ го свива в хапче отгоре; хапчето го връща. Нов `promptKey`
 *    (ново решение) винаги го показва отново.
 *  - `optional`: обява, която може и да не направиш — бутонът „Не сега“
 *    го скрива до следващата възможност (нов `promptKey`).
 *  - Рендира се на <body> — върху сцената `fixed` се позиционираше спрямо нея.
 */
export function DecisionPrompt({
  open,
  promptKey,
  title,
  hint,
  children,
  placement = "center",
  optional,
  testId,
}: {
  /** Решението е на ред за мен (и мачът тече). */
  open: boolean;
  /** Идентичност на решението — смяна = ново решение (показва се отново). */
  promptKey: string;
  title: string;
  /** Кратко пояснение: текуща обява, точки, какво се иска. */
  hint?: ReactNode;
  /** Бутоните с изборите. */
  children: ReactNode;
  /** „center“ — по средата на масата (там е празно при обявяване);
   *  „top“ — горната трета, когато в средата има карти, които трябва да се виждат. */
  placement?: "center" | "top";
  /** Обява по желание: етикет на бутона за отказ и какво става при него. */
  optional?: { label: string; onSkip?: () => void };
  testId?: string;
}) {
  const { t } = useTranslation();
  const titleId = useId();
  const still = useSettings((s) => s.reducedMotion);
  const cardRef = useRef<HTMLDivElement>(null);
  // Свито/отказано — за ТОВА решение; ново решение (promptKey) започва видимо.
  const [hiddenFor, setHiddenFor] = useState<{ key: string; mode: "min" | "skip" } | null>(null);
  const hidden = hiddenFor?.key === promptKey ? hiddenFor.mode : null;

  // Часовникът на хода — заглавието на сцената може да е извън екрана.
  const mySeat = useMatchStore((s) => s.seat);
  const turn = useMatchStore((s) => s.turn);
  const turnEndsAt = useMatchStore((s) => s.turnEndsAt);
  const [now, setNow] = useState(() => Date.now());
  const clockOn = open && turn === mySeat && turnEndsAt > 0;
  useEffect(() => {
    if (!clockOn) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [clockOn]);
  const secs = Math.max(0, Math.ceil((turnEndsAt - now) / 1000));

  const shown = open && hidden === null;

  // Фокус на първия избор, когато се появи ново решение — но не и ако играчът
  // пише (чатът), за да не му открадне курсора.
  useEffect(() => {
    if (!shown) return;
    const active = document.activeElement;
    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;
    const first = cardRef.current?.querySelector<HTMLElement>("button:not([disabled])");
    first?.focus({ preventScroll: true });
  }, [shown, promptKey]);

  // Escape свива прозореца (решението остава — хапчето го връща).
  useEffect(() => {
    if (!shown) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      setHiddenFor({ key: promptKey, mode: "min" });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [shown, promptKey]);

  if (!open || hidden === "skip") return null;

  if (hidden === "min") {
    return createPortal(
      <div className="aso-decision-pill-wrap">
        <button
          type="button"
          className="aso-decision-pill"
          data-testid={testId ? `${testId}-reopen` : undefined}
          data-decision-reopen=""
          onClick={() => setHiddenFor(null)}
        >
          ▲ {title}
          {clockOn ? <span className="tnum"> · {secs} {t("decision.sec")}</span> : null}
        </button>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div className={`aso-decision-wrap aso-decision-wrap--${placement}`}>
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        className={still ? "aso-decision is-still" : "aso-decision"}
        data-testid={testId}
        data-decision=""
        data-decision-key={promptKey}
      >
        <div className="aso-decision__head">
          <h2 id={titleId} className="aso-decision__title">
            {title}
          </h2>
          {clockOn ? (
            <span className={`aso-decision__clock tnum${secs <= 5 ? " is-low" : ""}`} aria-live={secs <= 5 ? "polite" : "off"}>
              ⏱ {secs} {t("decision.sec")}
            </span>
          ) : null}
        </div>
        {hint ? <div className="aso-decision__hint">{hint}</div> : null}
        <div className="aso-decision__actions">{children}</div>
        <div className="aso-decision__foot">
          {optional ? (
            <button
              type="button"
              className="aso-decision__link"
              data-decision-skip=""
              onClick={() => {
                setHiddenFor({ key: promptKey, mode: "skip" });
                optional.onSkip?.();
              }}
            >
              {optional.label}
            </button>
          ) : null}
          <button
            type="button"
            className="aso-decision__link"
            data-decision-minimize=""
            onClick={() => setHiddenFor({ key: promptKey, mode: "min" })}
          >
            {t("decision.minimize")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
