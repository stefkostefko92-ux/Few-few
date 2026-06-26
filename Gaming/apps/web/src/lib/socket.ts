import { io, type Socket } from "socket.io-client";
import { useConnectionStore } from "./store";

/**
 * Singleton Socket.IO client. Same-origin: the Vite dev proxy (and nginx in
 * prod) forwards /socket.io to the realtime server, so the httpOnly auth cookie
 * is sent automatically on the handshake.
 */
let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io({ autoConnect: true, transports: ["websocket"], withCredentials: true });
    // Surface connection health to the chrome (reconnect banner). A deliberate
    // client disconnect (logout) is not an outage.
    socket.on("disconnect", (reason) => {
      if (reason !== "io client disconnect") useConnectionStore.getState().setDown(true);
    });
    socket.on("connect", () => useConnectionStore.getState().setDown(false));
  }
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
  useConnectionStore.getState().setDown(false);
}
