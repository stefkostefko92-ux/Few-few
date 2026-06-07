/**
 * KAGURA SPIN — TypeScript client SDK.
 *
 * Zero-dependency, isomorphic wrapper over the backend HTTP API + the clan-chat
 * WebSocket. Uses the platform's global `fetch`/`WebSocket`, so it runs in the
 * browser (web-shop/demo, §8.1) and in Node 22+ (tooling/tests). The Unity
 * client (§11.1) would mirror these same calls in C#.
 */

// ---- Domain shapes (mirror of the server's public player view) ----------

export type ReelSymbol = "coin" | "ward" | "strike" | "raid" | "spirit";
export type Rarity = "common" | "rare" | "epic" | "mythic";
export type Platform = "ios" | "android" | "stripe";

export interface Building {
  level: number;
}
export interface Island {
  index: number;
  buildings: Building[];
  completed: boolean;
}
export interface Companion {
  id: string;
  rarity: Rarity;
  summonedAt: number;
}
export interface PublicPlayer {
  id: string;
  name: string;
  spins: number;
  coins: number;
  spiritTokens: number;
  gems: number;
  shields: number;
  currentIsland: number;
  islands: Island[];
  companions: Companion[];
  clanId: string | null;
  pendingAttack: { expiresAt: number } | null;
  pendingRaid: { targetId: string; picks: number; spots: number; expiresAt: number } | null;
}

export interface SpinOutcome {
  type: "JACKPOT" | "SHIELDS" | "ATTACK" | "RAID" | "SPIRIT" | "MIX";
  reels: [ReelSymbol, ReelSymbol, ReelSymbol];
  coins: number;
  shields: number;
  spiritTokens: number;
  action?: "ATTACK" | "RAID";
}

export interface Product {
  productId: string;
  kind: string;
  priceEUR: number;
  grants: Record<string, number>;
  oneTime: boolean;
}
export interface Clan {
  id: string;
  name: string;
  tag: string;
  leaderId: string;
  memberIds: string[];
  currentWarId: string | null;
}
export interface WarStatus {
  warId: string;
  myClanId: string;
  opponentClanId: string;
  myScore: number;
  opponentScore: number;
  endsAt: number;
  active: boolean;
}
export interface LeaderboardEntry {
  playerId: string;
  name: string;
  score: number;
  rank: number;
}
export interface ChatEvent {
  type: "history" | "chat";
  messages?: { from: string; name: string; text: string; at: number }[];
  from?: string;
  name?: string;
  text?: string;
  at?: number;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
}

export class KaguraError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "KaguraError";
  }
}

export interface ChatConnection {
  send(text: string): void;
  close(): void;
}

export interface KaguraClientOptions {
  baseUrl: string;
  /** Pre-existing session (e.g. restored from storage). */
  session?: AuthSession;
  /** Override fetch (e.g. to inject credentials mode). Defaults to global fetch. */
  fetch?: typeof fetch;
}

/** Generate a stable per-install device id (persist this client-side). */
export function generateDeviceId(): string {
  const rnd =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `kagura-${rnd}`;
}

export class KaguraClient {
  private readonly baseUrl: string;
  private readonly doFetch: typeof fetch;
  private session: AuthSession | undefined;

  constructor(opts: KaguraClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.session = opts.session;
    this.doFetch = opts.fetch ?? globalThis.fetch.bind(globalThis);
  }

  getSession(): AuthSession | undefined {
    return this.session;
  }

  // ---- Auth (§11.2) ---------------------------------------------------

  async register(name: string, deviceId: string): Promise<{ player: PublicPlayer; deviceSecret: string }> {
    const res = await this.request<{ player: PublicPlayer; deviceSecret: string } & AuthSession>(
      "POST",
      "/auth/register",
      { name, deviceId },
      false,
    );
    this.session = { accessToken: res.accessToken, refreshToken: res.refreshToken };
    return { player: res.player, deviceSecret: res.deviceSecret };
  }

  async login(deviceId: string, deviceSecret: string): Promise<{ playerId: string }> {
    const res = await this.request<{ playerId: string } & AuthSession>(
      "POST",
      "/auth/login",
      { deviceId, deviceSecret },
      false,
    );
    this.session = { accessToken: res.accessToken, refreshToken: res.refreshToken };
    return { playerId: res.playerId };
  }

  async refresh(): Promise<void> {
    if (!this.session) throw new KaguraError("NO_SESSION", "no session to refresh", 401);
    const res = await this.request<AuthSession>("POST", "/auth/refresh", {
      refreshToken: this.session.refreshToken,
    }, false);
    this.session = res;
  }

  async logout(): Promise<void> {
    await this.request("POST", "/auth/logout", undefined, true);
    this.session = undefined;
  }

  // ---- Game (§5) ------------------------------------------------------

  me(): Promise<{ player: PublicPlayer }> {
    return this.request("GET", "/me");
  }
  spin(betMultiplier = 1): Promise<{ outcome: SpinOutcome; player: PublicPlayer }> {
    return this.request("POST", "/spin", { betMultiplier });
  }
  build(buildingIndex: number): Promise<{ player: PublicPlayer; newLevel: number; cost: number; unlockedIsland: number | null }> {
    return this.request("POST", "/build", { buildingIndex });
  }
  attackCandidates(): Promise<{ candidates: { id: string; name: string; island: number }[] }> {
    return this.request("GET", "/attack/candidates");
  }
  attack(targetId: string, buildingIndex: number): Promise<{ player: PublicPlayer; blocked: boolean; reward: number }> {
    return this.request("POST", "/attack", { targetId, buildingIndex });
  }
  raid(picks: number[]): Promise<{ player: PublicPlayer; reward: number }> {
    return this.request("POST", "/raid", { picks });
  }
  summon(): Promise<{ rarity: Rarity; viaPity: boolean; companion: Companion }> {
    return this.request("POST", "/gacha/pull");
  }
  gachaRates(): Promise<{ rates: Record<Rarity, number>; pity: { epic: number; mythic: number } }> {
    return this.request("GET", "/gacha/rates", undefined, false);
  }

  // ---- Monetization (§8) ----------------------------------------------

  shop(): Promise<{ products: Product[] }> {
    return this.request("GET", "/shop", undefined, false);
  }
  redeem(platform: Platform, productId: string, receipt: string): Promise<{ granted: boolean; player: PublicPlayer }> {
    return this.request("POST", "/iap/redeem", { platform, productId, receipt });
  }

  // ---- Clans (§7.2) ---------------------------------------------------

  listClans(): Promise<{ clans: Clan[] }> {
    return this.request("GET", "/clans", undefined, false);
  }
  createClan(name: string, tag: string): Promise<{ clan: Clan }> {
    return this.request("POST", "/clans", { name, tag });
  }
  joinClan(clanId: string): Promise<{ clan: Clan }> {
    return this.request("POST", `/clans/${encodeURIComponent(clanId)}/join`);
  }
  leaveClan(): Promise<{ ok: boolean }> {
    return this.request("POST", "/clans/leave");
  }
  declareWar(): Promise<{ war: WarStatus }> {
    return this.request("POST", "/clans/war/declare");
  }
  warStatus(): Promise<{ war: WarStatus | null }> {
    return this.request("GET", "/clans/war");
  }

  // ---- Leaderboard (§7.2) ---------------------------------------------

  leaderboard(top = 10): Promise<{ leaderboard: LeaderboardEntry[] }> {
    return this.request("GET", `/leaderboard?top=${top}`, undefined, false);
  }
  myRank(): Promise<{ rank: number | null }> {
    return this.request("GET", "/leaderboard/me");
  }

  // ---- Real-time clan chat (§7.2) -------------------------------------

  /** Open the clan-chat WebSocket. Requires an active session. */
  connectChat(onEvent: (e: ChatEvent) => void, onClose?: (code: number) => void): ChatConnection {
    if (!this.session) throw new KaguraError("NO_SESSION", "log in before connecting chat", 401);
    const wsUrl = this.baseUrl.replace(/^http/, "ws") + `/ws?token=${encodeURIComponent(this.session.accessToken)}`;
    const ws = new WebSocket(wsUrl);
    ws.onmessage = (ev: MessageEvent) => {
      try {
        onEvent(JSON.parse(typeof ev.data === "string" ? ev.data : String(ev.data)));
      } catch {
        /* ignore malformed frames */
      }
    };
    if (onClose) ws.onclose = (ev: CloseEvent) => onClose(ev.code);
    return {
      send: (text: string) => ws.send(JSON.stringify({ type: "chat", text })),
      close: () => ws.close(),
    };
  }

  // ---- Transport ------------------------------------------------------

  private async request<T = unknown>(method: string, path: string, body?: unknown, auth = true): Promise<T> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["content-type"] = "application/json";
    if (auth) {
      if (!this.session) throw new KaguraError("NO_SESSION", "not authenticated", 401);
      headers["authorization"] = `Bearer ${this.session.accessToken}`;
    }
    const res = await this.doFetch(this.baseUrl + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    const json = text ? JSON.parse(text) : {};
    if (!res.ok) {
      const err = (json as { error?: { code?: string; message?: string } }).error;
      throw new KaguraError(err?.code ?? "ERROR", err?.message ?? res.statusText, res.status);
    }
    return json as T;
  }
}
