import type { AuthRepository, Credential } from "./authRepository.js";
import type { PrismaClient } from "./prismaClient.js";

/** Postgres-backed AuthRepository (§11.2). */
export class PrismaAuthRepository implements AuthRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(cred: Credential): Promise<void> {
    await this.prisma.credential.create({ data: toRow(cred) });
  }

  async getByDevice(deviceId: string): Promise<Credential | undefined> {
    const row = await this.prisma.credential.findUnique({ where: { deviceId } });
    return row ? fromRow(row) : undefined;
  }

  async getByPlayer(playerId: string): Promise<Credential | undefined> {
    const row = await this.prisma.credential.findUnique({ where: { playerId } });
    return row ? fromRow(row) : undefined;
  }

  async save(cred: Credential): Promise<void> {
    await this.prisma.credential.update({
      where: { playerId: cred.playerId },
      data: {
        deviceId: cred.deviceId,
        secretHash: cred.secretHash,
        tokenVersion: cred.tokenVersion,
        lastSeenAt: new Date(cred.lastSeenAt),
      },
    });
  }
}

interface CredentialRow {
  playerId: string;
  deviceId: string;
  secretHash: string;
  tokenVersion: number;
  createdAt: Date;
  lastSeenAt: Date;
}

function toRow(c: Credential) {
  return {
    playerId: c.playerId,
    deviceId: c.deviceId,
    secretHash: c.secretHash,
    tokenVersion: c.tokenVersion,
    createdAt: new Date(c.createdAt),
    lastSeenAt: new Date(c.lastSeenAt),
  };
}

function fromRow(row: CredentialRow): Credential {
  return {
    playerId: row.playerId,
    deviceId: row.deviceId,
    secretHash: row.secretHash,
    tokenVersion: row.tokenVersion,
    createdAt: row.createdAt.getTime(),
    lastSeenAt: row.lastSeenAt.getTime(),
  };
}
