"use client";

import { forwardRef } from "react";
import { MessageCircle, X } from "@/components/icons";
import { UI_LABEL } from "@/lib/ui-labels";

// Плаващият бутон на чата — един и същ в ChatWidgetLazy (преди чатът да е
// зареден) и в ChatWidget, за да няма скок при смяната.
//  • телефон: кръгче 48px над безопасната зона (iPhone), надписът е само за
//    екранния четец; докато чатът е отворен, бутонът е скрит (панелът е
//    долен лист със свой бутон „Затворете“);
//  • от sm: бутон с надпис „Попитайте помощника“ — иконата сама не се
//    разпознава от всички.
// Клас chat-fab: скрит при отворено мобилно меню, с контур в тъмен режим
// (globals.css).
export const ChatFab = forwardRef<
  HTMLButtonElement,
  { open?: boolean; onClick: () => void }
>(function ChatFab({ open = false, onClick }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-haspopup="dialog"
      className={
        "chat-fab no-print fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] right-3 z-50 h-12 w-12 items-center justify-center gap-2 rounded-full bg-brand-700 text-white shadow-lg hover:bg-brand-800 sm:bottom-4 sm:right-4 sm:h-14 sm:w-auto sm:rounded-xl sm:px-5 " +
        (open ? "hidden sm:flex" : "flex")
      }
    >
      {open ? (
        <X className="h-6 w-6 shrink-0" aria-hidden />
      ) : (
        <MessageCircle className="h-6 w-6 shrink-0" aria-hidden />
      )}
      <span className="sr-only text-base font-semibold sm:not-sr-only">
        {open ? UI_LABEL.chatClose : UI_LABEL.chat}
      </span>
    </button>
  );
});
