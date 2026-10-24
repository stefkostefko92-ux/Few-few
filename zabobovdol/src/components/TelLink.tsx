"use client";

// Обикновена tel: връзка, която брои обаждането (tel_click) — без да пази нищо
// за човека, само брой на ден. Ползва се навсякъде, където показваме номер.
// Без children показва номера в единния формат („0877 414 874“, „0702 6 23 23“).

import type { ReactNode } from "react";
import { track } from "@/lib/events";
import { formatPhoneBg } from "@/lib/phone";

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
  const shown = children ?? formatPhoneBg(phone);
  if (!digits) return <span className={className}>{shown}</span>;
  return (
    <a
      href={`tel:${digits}`}
      className={className}
      aria-label={ariaLabel}
      onClick={() => track("tel_click")}
    >
      {shown}
    </a>
  );
}
