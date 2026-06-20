"use client";

import { Printer } from "lucide-react";

// Браузърите вградени във Facebook/Instagram/Messenger често НЕ могат да
// отварят прозорец за печат — затова ги разпознаваме и даваме ясна инструкция.
function isInAppBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /FBAN|FBAV|FB_IAB|Instagram|Messenger|Line\/|TikTok|Snapchat|Viber/i.test(ua);
}

export function PrintButton({
  label = "Принтирай",
  variant = "primary",
}: {
  label?: string;
  variant?: "primary" | "secondary";
}) {
  const handlePrint = () => {
    if (isInAppBrowser()) {
      window.alert(
        "За да отпечатате, отворете страницата в Chrome или Safari:\n" +
          "натиснете менюто (⋯ или ≡) горе вдясно и изберете „Отвори в браузъра“.",
      );
      return;
    }
    try {
      if (typeof window !== "undefined" && typeof window.print === "function") {
        window.print();
      } else {
        throw new Error("print unavailable");
      }
    } catch {
      window.alert(
        "Печатът не е наличен в този браузър. Отворете страницата в Chrome или Safari и опитайте отново.",
      );
    }
  };

  return (
    <button
      type="button"
      onClick={handlePrint}
      className={(variant === "secondary" ? "btn-secondary" : "btn-primary") + " no-print"}
    >
      <Printer className="h-5 w-5" aria-hidden />
      {label}
    </button>
  );
}
