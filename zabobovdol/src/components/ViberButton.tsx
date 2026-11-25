"use client";

import { MessageCircle } from "@/components/icons";
import { track } from "@/lib/events";

export function ViberButton({ url, className = "" }: { url: string; className?: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`btn-secondary ${className}`.trim()}
      onClick={() => track("viber_click")}
    >
      <MessageCircle className="h-5 w-5 shrink-0 text-[#7360f2]" aria-hidden />
      Абонирайте се във Viber
    </a>
  );
}
