"use client";

// Обикновена tel: връзка, която брои обаждането (tel_click) — без да пази нищо
// за човека, само брой на ден. Ползва се навсякъде, където показваме номер.

import type { ReactNode } from "react";
import { track } from "@/lib/events";

export function TelLink({
  phone,
  className,
  children,
  "aria-label": ariaLabel,
}: {
  phone: string;
  className?: string;
  children?: ReactNode;
  "aria-label"?: string;
}) {
  // В tel: остават само цифрите и „+“ — интервалите и думите („централа“)
  // объркват някои телефони.
  const digits = phone.replace(/[^\d+]/g, "");
  if (!digits) return <span className={className}>{children ?? phone}</span>;
  return (
    <a
      href={`tel:${digits}`}
      className={className}
      aria-label={ariaLabel}
      onClick={() => track("tel_click")}
    >
      {children ?? phone}
    </a>
  );
}
