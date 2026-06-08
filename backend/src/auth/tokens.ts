import { SignJWT, jwtVerify } from "jose";
import { GameError } from "../errors.js";

export interface AccessClaims {
  playerId: string;
  deviceId: string;
}

export interface RefreshClaims extends AccessClaims {
  tokenVersion: number;
}

const ACCESS_TTL = "15m";
const REFRESH_TTL = "30d";

/**
 * HS256 JWT issuing/verification (jose, §11.2). Access tokens are short-lived
 * and stateless; refresh tokens carry a `tokenVersion` so logout can invalidate
 * them server-side. Tokens are bound to the device they were issued for.
 */
export class TokenService {
  private readonly secret: Uint8Array;

  constructor(secret: string) {
    if (!secret || secret.length < 16) {
      throw new Error("JWT secret must be at least 16 characters");
    }
    this.secret = new TextEncoder().encode(secret);
  }

  signAccess(playerId: string, deviceId: string): Promise<string> {
    return new SignJWT({ did: deviceId, typ: "access" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(playerId)
      .setIssuedAt()
      .setExpirationTime(ACCESS_TTL)
      .sign(this.secret);
  }

  signRefresh(playerId: string, deviceId: string, tokenVersion: number): Promise<string> {
    return new SignJWT({ did: deviceId, tv: tokenVersion, typ: "refresh" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(playerId)
      .setIssuedAt()
      .setExpirationTime(REFRESH_TTL)
      .sign(this.secret);
  }

  async verifyAccess(token: string): Promise<AccessClaims> {
    const { payload } = await this.verify(token);
    if (payload.typ !== "access") throw unauthorized("not an access token");
    return { playerId: String(payload.sub), deviceId: String(payload.did) };
  }

  async verifyRefresh(token: string): Promise<RefreshClaims> {
    const { payload } = await this.verify(token);
    if (payload.typ !== "refresh") throw unauthorized("not a refresh token");
    return {
      playerId: String(payload.sub),
      deviceId: String(payload.did),
      tokenVersion: Number(payload.tv),
    };
  }

  private async verify(token: string) {
    try {
      return await jwtVerify(token, this.secret);
    } catch {
      throw unauthorized("invalid or expired token");
    }
  }
}

function unauthorized(message: string): GameError {
  return new GameError("UNAUTHENTICATED", message, 401);
}
