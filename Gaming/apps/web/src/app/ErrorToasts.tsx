import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { SOCKET_EVENTS, type SocketErrorMsg } from "@aso/shared";
import { getSocket } from "../lib/socket";

interface Toast {
  id: number;
  code: string;
}

let nextId = 1;

/**
 * Global listener for server game:error events (mounted in Layout). Previously
 * these vanished silently — clicking a full room did nothing. Shows a small
 * auto-dismissing toast, localized by error code with a generic fallback.
 */
export function ErrorToasts() {
  const { t } = useTranslation();
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const socket = getSocket();
    const onError = (msg: SocketErrorMsg) => {
      const id = nextId++;
      setToasts((prev) => [...prev.slice(-2), { id, code: msg.code }]);
      setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 4000);
    };
    socket.on(SOCKET_EVENTS.ERROR, onError);
    return () => {
      socket.off(SOCKET_EVENTS.ERROR, onError);
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed inset-x-0 bottom-6 z-[70] flex flex-col items-center gap-2" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="rounded-card border border-loss/40 bg-felt-900/95 px-4 py-2 text-sm text-ink-100 shadow-lift backdrop-blur"
        >
          {t(`errors.${toast.code}`, { defaultValue: t("errors.generic") })}
        </div>
      ))}
    </div>
  );
}
