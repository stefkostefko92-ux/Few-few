# Scaling the realtime tier

The realtime server (`apps/realtime`) is horizontally scalable. Game state for a
match lives in **one** node's memory (the node that created the match), but
nothing else is node-local — so you can run N instances behind a load balancer.

## How it works

- **Cross-node broadcast.** Socket.IO uses the Redis adapter
  (`@socket.io/redis-adapter`), so `io.to(userRoom(id)).emit(...)` reaches a
  user's socket no matter which node it's connected to. Outbound game state,
  chat, invites, and presence "just work" across nodes.
- **Cross-node room ops.** Inbound operations that must mutate a room's
  in-memory state — `game:action`, `game:resync`, chat broadcast, and
  connect/disconnect presence — are forwarded with the adapter's server-side
  messaging (`io.serverSideEmit("op:*", …)`). A node that doesn't own the room
  forwards; the owning node applies. See `InterServerEvents` in
  `apps/realtime/src/index.ts`.
- **Single matcher.** Every node runs the 1s matchmaking tick, but only the
  node holding the Redis **leader lease** (`mm:leader`, 3s TTL) forms matches,
  so queued players are never double-matched. Queues, the active-queue set
  (`mm:active`), join timestamps, and player names are all read from Redis/DB,
  so the leader can match players who queued on any node.
- **Names.** Match creation reads display names from the DB, not a per-node
  cache, so seats are labelled correctly regardless of which node a player is on.

## Deployment notes

- **Transport.** The web client connects with `transports: ["websocket"]`
  (no long-polling), so a single TCP connection carries the session. A plain
  round-robin load balancer is fine — **sticky sessions are not required**.
  (If you ever re-enable polling, you must add sticky sessions.)
- **Redis is required** for multi-node (adapter + matcher lease + presence). A
  single instance still works without horizontal scaling; if Redis is briefly
  unreachable the lone node falls back to acting as leader.
- **Scale realtime independently** of the API. The API is stateless (JWT
  cookies + Redis), so it scales trivially behind the same LB.

## What is still single-owner

A given match's tick/timers/RNG run on its owning node. If that node dies
mid-match, the in-memory match is lost (clients see the socket drop and can
re-queue). Persisting/replaying live match state across a node failure is out
of scope; matches are short-lived, so the blast radius is one game.
