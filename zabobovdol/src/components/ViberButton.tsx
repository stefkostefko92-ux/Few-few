"use client";

import { track } from "@/lib/events";

export function ViberButton({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="btn-secondary min-h-[44px]"
      onClick={() => track("viber_click")}
    >
      Абонирай се във Viber
    </a>
  );
}
