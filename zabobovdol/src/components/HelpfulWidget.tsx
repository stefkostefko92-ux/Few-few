"use client";

import { useState } from "react";
import { track } from "@/lib/events";
import { UI_LABEL } from "@/lib/ui-labels";

// „Помогна ли ви?“ — единственият директен сигнал дали обяснението е свършило
// работа. Брои се само Да/Не на ден за страницата; нищо за човека.
// `bare` — без собствена рамка, за вграждане в общ панел (ArticleActions).
export function HelpfulWidget({
  className = "",
  bare = false,
}: {
  className?: string;
  bare?: boolean;
}) {
  const [answer, setAnswer] = useState<"yes" | "no" | null>(null);

  if (answer) {
    return (
      <p
        className={
          "no-print text-base text-slate-800 " +
          (bare ? "" : "rounded-xl bg-brand-50 px-4 py-3 ") +
          className
        }
        role="status"
      >
        {answer === "yes"
          ? "Благодарим! Радваме се, че помогна."
          : "Благодарим! Ще го направим по-ясно. Ако искате, попитайте помощника долу вдясно."}
      </p>
    );
  }

  return (
    <div
      className={
        "no-print flex flex-wrap items-center gap-3 " +
        (bare ? "" : "rounded-xl border border-slate-200 bg-white px-4 py-3 ") +
        className
      }
      role="group"
      aria-label="Помогна ли ви тази страница?"
    >
      <span className="text-base font-semibold text-slate-800">{UI_LABEL.helpful}</span>
      <button
        type="button"
        className="btn-secondary"
        onClick={() => {
          track("helpful_yes");
          setAnswer("yes");
        }}
      >
        Да
      </button>
      <button
        type="button"
        className="btn-secondary"
        onClick={() => {
          track("helpful_no");
          setAnswer("no");
        }}
      >
        Не
      </button>
    </div>
  );
}
