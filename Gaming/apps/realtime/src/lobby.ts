import { randomUUID } from "node:crypto";
import type { Server } from "socket.io";
import {
  SOCKET_EVENTS,
  seatRange,
  teamsFor,
  teamOfSeat,
  type GameKey,
  type LobbyClosedMsg,
  type LobbyListEntry,
  type LobbySeat,
  type LobbySnapshot,
  type LobbyVisibility,
} from "@aso/shared";
import { RandomBot } from "./bot.js";
import { redis } from "./redis.js";
import type { RoomSeat } from "./room.js";
import { logger } from "./logger.js";

const userRoom = (userId: string): string => `u:${userId}`;
const BOT_NAME = "АСО Бот";

interface Slot {
  userId: string | null;
  displayName: string;
  isBot: boolean;
  connected: boolean;
}

const emptySlot = (): Slot => ({ userId: null, displayName: "", isBot: false, connected: false });

/**
 * A pre-game room. The host assembles seats (humans, invited friends, bots),
 * arranges teams and tunes config, then starts — handing the assembled seating
 * to the Matchmaker which spins up the authoritative GameRoom. Lobby state is an
 * array of fixed slots whose index maps 1:1 to the engine seat on start, so
 * team membership (teamOfSeat) is just a function of the slot a player sits in.
 */
export class Lobby {
  readonly id = randomUUID();
  readonly minSeats: number;
  readonly maxSeats: number;
  readonly teams: number;
  readonly slots: Slot[];
  closed = false;

  constructor(
    readonly game: GameKey,
    public mode: string,
    public visibility: LobbyVisibility,
    public hostUserId: string,
    hostName: string,
    public config: unknown,
  ) {
    const range = seatRange(game);
    this.minSeats = range.min;
    this.maxSeats = range.max;
    this.teams = teamsFor(game);
    this.slots = Array.from({ length: this.maxSeats }, emptySlot);
    this.slots[0] = { userId: hostUserId, displayName: hostName, isBot: false, connected: true };
  }

  private slotOf(userId: string): number {
    return this.slots.findIndex((s) => s.userId === userId);
  }
  private firstEmpty(): number {
    return this.slots.findIndex((s) => s.userId === null && !s.isBot);
  }
  isHost(userId: string): boolean {
    return userId === this.hostUserId;
  }
  has(userId: string): boolean {
    return this.slotOf(userId) >= 0;
  }
  humans(): number {
    return this.slots.filter((s) => s.userId !== null).length;
  }
  occupied(): number {
    return this.slots.filter((s) => s.userId !== null || s.isBot).length;
  }

  /** Seating is valid to start once at least `minSeats` are filled (humans or
   *  bots), with ≥1 human present. Variable-seat games can start short of max. */
  canStart(): boolean {
    return this.occupied() >= this.minSeats && this.humans() >= 1;
  }

  join(userId: string, name: string): boolean {
    if (this.has(userId)) return true;
    const i = this.firstEmpty();
    if (i < 0) return false;
    this.slots[i] = { userId, displayName: name, isBot: false, connected: true };
    return true;
  }

  addBot(): boolean {
    const i = this.firstEmpty();
    if (i < 0) return false;
    this.slots[i] = { userId: null, displayName: BOT_NAME, isBot: true, connected: true };
    return true;
  }

  /** Clear a slot (host kick / remove bot). Returns the removed human id, if any. */
  clearSlot(seat: number): string | null {
    const s = this.slots[seat];
    if (!s) return null;
    const removed = s.userId;
    this.slots[seat] = emptySlot();
    return removed;
  }

  /** Move the player/bot at `seat` to the given team (relocating to a slot of
   *  that team — swapping if necessary). */
  setTeam(seat: number, team: number): boolean {
    const occ = this.slots[seat];
    if (!occ || (occ.userId === null && !occ.isBot)) return false;
    if (teamOfSeat(this.game, seat) === team) return true;
    const targets = this.slots
      .map((_, i) => i)
      .filter((i) => teamOfSeat(this.game, i) === team);
    if (targets.length === 0) return false;
    const empty = targets.find((i) => this.slots[i]!.userId === null && !this.slots[i]!.isBot);
    const dest = empty ?? targets[0]!;
    const tmp = this.slots[dest]!;
    this.slots[dest] = this.slots[seat]!;
    this.slots[seat] = tmp;
    return true;
  }

  /** Promote the next human to host (after the host leaves). Closes if none. */
  reassignHostIfNeeded(): void {
    if (this.slots[this.slotOf(this.hostUserId)]) return; // still seated
    const next = this.slots.find((s) => s.userId !== null);
    if (next?.userId) this.hostUserId = next.userId;
  }

  leave(userId: string): void {
    const i = this.slotOf(userId);
    if (i >= 0) this.slots[i] = emptySlot();
    if (userId === this.hostUserId) this.reassignHostIfNeeded();
  }

  toSeats(): LobbySeat[] {
    return this.slots.map((s, seat) => ({
      seat,
      userId: s.userId,
      displayName: s.userId === null && !s.isBot ? "" : s.displayName,
      isBot: s.isBot,
      isHost: s.userId !== null && s.userId === this.hostUserId,
      team: teamOfSeat(this.game, seat),
      connected: s.connected,
    }));
  }

  snapshot(): LobbySnapshot {
    return {
      id: this.id,
      game: this.game,
      mode: this.mode,
      visibility: this.visibility,
      hostUserId: this.hostUserId,
      seats: this.toSeats(),
      maxSeats: this.maxSeats,
      minSeats: this.minSeats,
      teams: this.teams,
      config: this.config,
      canStart: this.canStart(),
    };
  }

  listEntry(hostName: string): LobbyListEntry {
    return {
      id: this.id,
      game: this.game,
      hostName,
      players: this.occupied(),
      humans: this.humans(),
      maxSeats: this.maxSeats,
    };
  }

  /** Build the authoritative room seating from the occupied slots, compacted to
   *  a contiguous 0..n-1 range (variable-seat games may have left gaps). */
  toRoomSeats(seed: string): RoomSeat[] {
    return this.slots
      .filter((s) => s.userId !== null || s.isBot)
      .map((s, seat) => ({
        seat,
        userId: s.isBot ? null : s.userId,
        isBot: s.isBot,
        displayName: s.isBot ? BOT_NAME : s.displayName || "Играч",
        bot: s.isBot ? new RandomBot(`${seed}:bot:${seat}`) : undefined,
      }));
  }
}

/** Snapshot taken at match start so the party can regroup afterwards. */
export interface LobbyReturnInfo {
  game: GameKey;
  mode: string;
  visibility: LobbyVisibility;
  hostUserId: string;
  /** Every seat (humans AND bots), positional, so teams/bots reconstruct. */
  members: { userId: string | null; displayName: string; seat: number; isBot: boolean }[];
  config: unknown;
}

/** What the lobby layer needs from the matchmaker to launch a game. */
export interface LobbyLauncher {
  startFromLobby(lobby: Lobby): Promise<string>;
  activeMatchIdForUser(userId: string): string | undefined;
  /** True if the user currently sits in any matchmaking queue. */
  isQueued(userId: string): Promise<boolean>;
}

/**
 * Holds every open lobby across this node. (Lobbies are pre-game and short
 * lived; they live in node memory like rooms. A horizontally-scaled deployment
 * would move these to Redis, mirrored on the matchmaker's room ownership.)
 */
export class LobbyManager {
  private readonly lobbies = new Map<string, Lobby>();
  /** Resolves a userId → display name; injected to avoid a DB import here. */
  constructor(
    private readonly io: Server,
    private readonly launcher: LobbyLauncher,
    private readonly nameOf: (userId: string) => Promise<string>,
  ) {}

  get(id: string): Lobby | undefined {
    return this.lobbies.get(id);
  }

  /** Count of open (non-closed) lobbies — for metrics. */
  openCount(): number {
    let n = 0;
    for (const l of this.lobbies.values()) if (!l.closed) n++;
    return n;
  }

  /** The open lobby a user currently sits in, if any. */
  lobbyForUser(userId: string): Lobby | undefined {
    for (const l of this.lobbies.values()) if (!l.closed && l.has(userId)) return l;
    return undefined;
  }

  private broadcast(lobby: Lobby): void {
    const snap = lobby.snapshot();
    for (const s of lobby.slots) {
      if (s.userId) this.io.to(userRoom(s.userId)).emit(SOCKET_EVENTS.LOBBY_STATE, snap);
    }
  }

  private close(lobby: Lobby, reason: string, exceptStarted = false): void {
    lobby.closed = true;
    this.lobbies.delete(lobby.id);
    if (exceptStarted) return; // members get MATCH_FOUND instead
    const msg: LobbyClosedMsg = { lobbyId: lobby.id, reason };
    for (const s of lobby.slots) {
      if (s.userId) this.io.to(userRoom(s.userId)).emit(SOCKET_EVENTS.LOBBY_CLOSED, msg);
    }
  }

  async create(
    userId: string,
    game: GameKey,
    mode: string,
    visibility: LobbyVisibility,
    config: unknown,
  ): Promise<Lobby> {
    // One lobby per host: leaving any prior one first.
    const prev = this.lobbyForUser(userId);
    if (prev) this.leave(userId);
    const name = await this.nameOf(userId);
    const lobby = new Lobby(game, mode, visibility, userId, name, config);
    this.lobbies.set(lobby.id, lobby);
    this.broadcast(lobby);
    return lobby;
  }

  async join(userId: string, lobbyId: string): Promise<Lobby | null> {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby || lobby.closed) return null;
    if (!lobby.has(userId)) {
      const name = await this.nameOf(userId);
      if (!lobby.join(userId, name)) return null;
    }
    this.broadcast(lobby);
    return lobby;
  }

  leave(userId: string): void {
    const lobby = this.lobbyForUser(userId);
    if (!lobby) return;
    const wasHost = lobby.isHost(userId);
    lobby.leave(userId);
    this.io.to(userRoom(userId)).emit(SOCKET_EVENTS.LOBBY_CLOSED, {
      lobbyId: lobby.id,
      reason: "left",
    } satisfies LobbyClosedMsg);
    if (lobby.humans() === 0) {
      this.close(lobby, "empty");
      return;
    }
    if (wasHost) lobby.reassignHostIfNeeded();
    this.broadcast(lobby);
  }

  /** Host-only mutations. Each validates host + open lobby, then re-broadcasts. */
  private hostAction(userId: string, lobbyId: string, fn: (l: Lobby) => void): void {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby || lobby.closed || !lobby.isHost(userId)) return;
    fn(lobby);
    this.broadcast(lobby);
  }

  kick(userId: string, lobbyId: string, seat: number): void {
    this.hostAction(userId, lobbyId, (lobby) => {
      const target = lobby.slots[seat];
      if (!target || target.userId === lobby.hostUserId) return; // can't kick self
      const removed = lobby.clearSlot(seat);
      if (removed) {
        this.io.to(userRoom(removed)).emit(SOCKET_EVENTS.LOBBY_CLOSED, {
          lobbyId,
          reason: "kicked",
        } satisfies LobbyClosedMsg);
      }
    });
  }

  addBot(userId: string, lobbyId: string): void {
    this.hostAction(userId, lobbyId, (lobby) => void lobby.addBot());
  }

  removeBot(userId: string, lobbyId: string, seat: number): void {
    this.hostAction(userId, lobbyId, (lobby) => {
      if (lobby.slots[seat]?.isBot) lobby.clearSlot(seat);
    });
  }

  setTeam(userId: string, lobbyId: string, seat: number, team: number): void {
    this.hostAction(userId, lobbyId, (lobby) => void lobby.setTeam(seat, team));
  }

  setConfig(userId: string, lobbyId: string, config: unknown): void {
    this.hostAction(userId, lobbyId, (lobby) => {
      lobby.config = config;
    });
  }

  /** Invite a friend: push them the lobby id (the caller checks friendship). */
  invite(lobbyId: string, toUserId: string, fromName: string, game: GameKey): void {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby || lobby.closed) return;
    this.io.to(userRoom(toUserId)).emit(SOCKET_EVENTS.LOBBY_INVITE_RECEIVED, {
      lobbyId,
      fromName,
      game,
    });
  }

  async listPublic(game?: GameKey): Promise<LobbyListEntry[]> {
    const open = [...this.lobbies.values()].filter(
      (l) => !l.closed && l.visibility === "public" && (!game || l.game === game) && l.occupied() < l.maxSeats,
    );
    const entries = await Promise.all(open.map(async (l) => l.listEntry(await this.nameOf(l.hostUserId))));
    return entries;
  }

  /** Recreate the pre-game room for a party whose match just ended, so "one
   *  more?" is one click. Only members who are ONLINE, not in another lobby and
   *  not already queued elsewhere are seated (an offline "member" would leave a
   *  zombie lobby that nothing ever reaps); bots and seat positions (teams) are
   *  reconstructed from the snapshot. */
  async regroup(info: LobbyReturnInfo): Promise<void> {
    const humans = info.members.filter((m) => !m.isBot && m.userId !== null);
    const alive = new Set<string>();
    for (const m of humans) {
      const id = m.userId!;
      if (this.lobbyForUser(id)) continue; // already parked in another room
      const online = await redis.exists(`presence:online:${id}`).catch(() => 0);
      if (online !== 1) continue; // disconnected during/after the match
      if (await this.launcher.isQueued(id).catch(() => false)) continue; // clicked "play again"
      alive.add(id);
    }
    if (alive.size === 0) return;
    const hostMember =
      humans.find((m) => m.userId === info.hostUserId && alive.has(m.userId)) ??
      humans.find((m) => m.userId !== null && alive.has(m.userId))!;
    const lobby = new Lobby(
      info.game,
      info.mode,
      info.visibility,
      hostMember.userId!,
      hostMember.displayName,
      info.config,
    );
    // Positional reconstruction: same seats → same teams; bots come back too.
    for (let i = 0; i < lobby.slots.length; i++) {
      lobby.slots[i] = { userId: null, displayName: "", isBot: false, connected: false };
    }
    for (const m of info.members) {
      if (m.seat >= lobby.slots.length) continue;
      if (m.isBot) {
        lobby.slots[m.seat] = { userId: null, displayName: m.displayName, isBot: true, connected: true };
      } else if (m.userId !== null && alive.has(m.userId)) {
        lobby.slots[m.seat] = { userId: m.userId, displayName: m.displayName, isBot: false, connected: true };
      }
    }
    this.lobbies.set(lobby.id, lobby);
    this.broadcast(lobby);
  }

  async start(userId: string, lobbyId: string): Promise<void> {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby || lobby.closed || !lobby.isHost(userId) || !lobby.canStart()) return;
    try {
      await this.launcher.startFromLobby(lobby);
      this.close(lobby, "started", true);
    } catch (err) {
      logger.error({ err, lobbyId }, "lobby start failed");
    }
  }
}
