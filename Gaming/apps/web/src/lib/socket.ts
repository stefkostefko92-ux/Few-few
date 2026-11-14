import { io, type Socket } from "socket.io-client";
import { useConnectionStore } from "./store";
import { tryRefresh } from "./api";

/**
 * Singleton Socket.IO client. Same-origin: the Vite dev proxy (and nginx in
 * prod) forwards /socket.io to the realtime server, so the httpOnly auth cookie
 * is sent automatically on the handshake.
 */
let socket: Socket | null = null;
let reauthTries = 0;

export function getSocket(): Socket {
  if (!socket) {
    socket = io({ autoConnect: true, transports: ["websocket"], withCredentials: true });
    // Surface connection health to the chrome (reconnect banner). A deliberate
    // client disconnect (logout) is not an outage.
    socket.on("disconnect", (reason) => {
      if (reason !== "io client disconnect") useConnectionStore.getState().setDown(true);
    });
    socket.on("connect", () => {
      reauthTries = 0;
      useConnectionStore.getState().setDown(false);
    });
    // The handshake authenticates with the ~15-min access cookie. When the server
    // REJECTS a reconnect (e.g. after a deploy restart, the cookie has expired),
    // socket.io does not retry on its own (socket.active === false): rotate the
    // cookie from the refresh cookie and reconnect, a few times at most.
    socket.on("connect_error", () => {
      const s = socket;
      if (!s || s.active || reauthTries >= 3) return; // transport error → the client retries itself
      reauthTries++;
      void tryRefresh().then((ok) => {
        if (ok && socket === s) s.connect();
      });
    });
  }
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
  useConnectionStore.getState().setDown(false);
}
