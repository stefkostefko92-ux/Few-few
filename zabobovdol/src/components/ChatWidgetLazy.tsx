"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { ChatFab } from "@/components/ChatFab";

// Целият чат (разговор, поток, списъци) е отделен чънк и не влиза в JS на
// страницата. Бутонът е видим веднага; чатът се зарежда след натискане или
// когато браузърът е свободен (idle), което стане първо.
const ChatWidget = dynamic(
  () => import("@/components/ChatWidget").then((m) => m.ChatWidget),
  { ssr: false },
);

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};

export function ChatWidgetLazy() {
  const pathname = usePathname();
  const [loaded, setLoaded] = useState(false);
  const [openOnLoad, setOpenOnLoad] = useState(false);
  const isAdmin = pathname?.startsWith("/admin");

  useEffect(() => {
    if (isAdmin || loaded) return;
    const w = window as IdleWindow;
    const start = () => setLoaded(true);
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(start, { timeout: 8000 });
      return () => w.cancelIdleCallback?.(id);
    }
    const t = window.setTimeout(start, 4000);
    return () => window.clearTimeout(t);
  }, [isAdmin, loaded]);

  const onClick = useCallback(() => {
    setOpenOnLoad(true);
    setLoaded(true);
  }, []);

  if (isAdmin) return null;
  if (loaded) return <ChatWidget initialOpen={openOnLoad} />;

  // Същият бутон като в ChatWidget — без скок в оформлението при смяната.
  return <ChatFab onClick={onClick} />;
}
