import { useCallback, useEffect, useRef, useState } from "react";
import { SOCKET_EVENTS, type ChatMessageMsg } from "@aso/shared";
import { getSocket } from "../../../lib/socket";

const MAX_KEPT = 60; // ring buffer; older lines fall off

/** A chat line with a stable client-side id (for React keys; the ring buffer
 *  shifts indices, so index keys would mis-reconcile). */
export interface ChatLine extends ChatMessageMsg {
  cid: number;
}

export interface ChatHandle {
  messages: ChatLine[];
  send: (text: string) => void;
  muted: Set<number>;
  toggleMute: (seat: number) => void;
}

/**
 * Subscribes to chat for a single match. Messages from muted seats are dropped
 * on arrival (client-side mute layered over server moderation). Returns a
 * capped, append-only list plus a send helper.
 */
export function useChat(matchId: string | null): ChatHandle {
  const [messages, setMessages] = useState<ChatLine[]>([]);
  const [muted, setMuted] = useState<Set<number>>(new Set());
  // Keep mute set current inside the socket handler without re-subscribing.
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const seqRef = useRef(0);

  useEffect(() => {
    setMessages([]);
    if (!matchId) return;
    const socket = getSocket();

    const onMessage = (msg: ChatMessageMsg) => {
      if (msg.matchId !== matchId) return;
      if (mutedRef.current.has(msg.seat)) return;
      setMessages((prev) => {
        const next = [...prev, { ...msg, cid: seqRef.current++ }];
        return next.length > MAX_KEPT ? next.slice(next.length - MAX_KEPT) : next;
      });
    };

    socket.on(SOCKET_EVENTS.CHAT_MESSAGE, onMessage);
    return () => {
      socket.off(SOCKET_EVENTS.CHAT_MESSAGE, onMessage);
    };
  }, [matchId]);

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (matchId && trimmed) getSocket().emit(SOCKET_EVENTS.CHAT_SEND, { matchId, text: trimmed });
    },
    [matchId],
  );

  const toggleMute = useCallback((seat: number) => {
    setMuted((prev) => {
      const next = new Set(prev);
      if (next.has(seat)) next.delete(seat);
      else next.add(seat);
      return next;
    });
  }, []);

  return { messages, send, muted, toggleMute };
}
