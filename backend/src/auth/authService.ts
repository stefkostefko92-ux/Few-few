import { randomBytes, randomUUID } from "node:crypto";
import type { AuthRepository, Credential } from "../data/authRepository.js";
import type { Player } from "../domain/types.js";
import { GameError } from "../errors.js";
import type { Clock } from "../services/clock.js";
import { systemClock } from "../services/clock.js";
import { hashSecret, verifySecret } from "./password.js";
import type { TokenService } from "./tokens.js";
import { noopAnalytics, type Analytics } from "../analytics/analytics.js";

/** Creates a fresh player (with starting bonus) — provided by GameService. */
export type CreatePlayer = (name: string) => Promise<Player>;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface RegisterResult extends AuthTokens {
  player: Player;
  /** Returned ONCE — the client stores it to log in again on this device. */
  deviceSecret: string;
}

export interface LoginResult extends AuthTokens {
  playerId: string;
}

export interface AuthServiceDeps {
  authRepo: AuthRepository;
  tokens: TokenService;
  createPlayer: CreatePlayer;
  clock?: Clock;
  analytics?: Analytics;
}

/**
 * Device-bound authentication (§11.2). Registration creates a player and binds a
 * generated device secret (hashed at rest); login exchanges the secret for a
 * short-lived access token + a refresh token carrying a tokenVersion that logout
 * can bump to revoke all sessions.
 */
export class AuthService {
  private readonly authRepo: AuthRepository;
  private readonly tokens: TokenService;
  private readonly createPlayer: CreatePlayer;
  private readonly clock: Clock;
  private readonly analytics: Analytics;

  constructor(deps: AuthServiceDeps) {
    this.authRepo = deps.authRepo;
    this.tokens = deps.tokens;
    this.createPlayer = deps.createPlayer;
    this.clock = deps.clock ?? systemClock;
    this.analytics = deps.analytics ?? noopAnalytics;
  }

  async register(name: string, deviceId: string): Promise<RegisterResult> {
    const existing = await this.authRepo.getByDevice(deviceId);
    if (existing) {
      throw new GameError("DEVICE_TAKEN", "device already registered — use /auth/login", 409);
    }
    const now = this.clock.now();
    const deviceSecret = randomBytes(24).toString("hex");
    const player = await this.createPlayer(name);
    const cred: Credential = {
      playerId: player.id,
      deviceId,
      secretHash: await hashSecret(deviceSecret),
      tokenVersion: 0,
      createdAt: now,
      lastSeenAt: now,
    };
    await this.authRepo.create(cred);
    this.analytics.track({ type: "REGISTER", playerId: player.id, at: now, name });
    const tokens = await this.issue(cred);
    return { player, deviceSecret, ...tokens };
  }

  async login(deviceId: string, deviceSecret: string): Promise<LoginResult> {
    const cred = await this.authRepo.getByDevice(deviceId);
    // Verify even on miss to avoid leaking which devices exist (timing).
    const ok = cred ? await verifySecret(deviceSecret, cred.secretHash) : await verifySecret(deviceSecret, DUMMY_HASH);
    if (!cred || !ok) throw new GameError("BAD_CREDENTIALS", "invalid device or secret", 401);

    cred.lastSeenAt = this.clock.now();
    await this.authRepo.save(cred);
    const tokens = await this.issue(cred);
    return { playerId: cred.playerId, ...tokens };
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    const claims = await this.tokens.verifyRefresh(refreshToken);
    const cred = await this.authRepo.getByPlayer(claims.playerId);
    if (!cred || cred.tokenVersion !== claims.tokenVersion || cred.deviceId !== claims.deviceId) {
      throw new GameError("UNAUTHENTICATED", "refresh token revoked", 401);
    }
    return this.issue(cred);
  }

  /** Bumps tokenVersion → all existing refresh tokens become invalid. */
  async logout(playerId: string): Promise<void> {
    const cred = await this.authRepo.getByPlayer(playerId);
    if (!cred) return;
    cred.tokenVersion += 1;
    await this.authRepo.save(cred);
  }

  private async issue(cred: Credential): Promise<AuthTokens> {
    const [accessToken, refreshToken] = await Promise.all([
      this.tokens.signAccess(cred.playerId, cred.deviceId),
      this.tokens.signRefresh(cred.playerId, cred.deviceId, cred.tokenVersion),
    ]);
    return { accessToken, refreshToken };
  }
}

// A well-formed hash for a random secret, so failed logins still spend time
// hashing (mitigates user-enumeration via response timing).
const DUMMY_HASH = `scrypt$${randomUUID().replace(/-/g, "")}$${"0".repeat(128)}`;
