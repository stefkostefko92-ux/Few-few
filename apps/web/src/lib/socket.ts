import { io, type Socket } from "socket.io-client";

/**
 * Singleton Socket.IO client. Same-origin: the Vite dev proxy (and nginx in
 * prod) forwards /socket.io to the realtime server, so the httpOnly auth cookie
 * is sent automatically on the handshake.
 */
let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io({ autoConnect: true, transports: ["websocket"], withCredentials: true });
  }
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
