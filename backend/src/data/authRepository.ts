/** Device-bound credential for a player (§11.2). */
export interface Credential {
  playerId: string;
  deviceId: string;
  secretHash: string;
  tokenVersion: number;
  createdAt: number;
  lastSeenAt: number;
}

/**
 * Auth persistence boundary. Memory and Prisma implementations mirror each
 * other so auth works with either storage backend.
 */
export interface AuthRepository {
  create(cred: Credential): Promise<void>;
  getByDevice(deviceId: string): Promise<Credential | undefined>;
  getByPlayer(playerId: string): Promise<Credential | undefined>;
  save(cred: Credential): Promise<void>;
}

export class MemoryAuthRepository implements AuthRepository {
  private readonly byPlayer = new Map<string, Credential>();
  private readonly byDevice = new Map<string, string>(); // deviceId -> playerId

  async create(cred: Credential): Promise<void> {
    this.byPlayer.set(cred.playerId, cred);
    this.byDevice.set(cred.deviceId, cred.playerId);
  }

  async getByDevice(deviceId: string): Promise<Credential | undefined> {
    const pid = this.byDevice.get(deviceId);
    return pid ? this.byPlayer.get(pid) : undefined;
  }

  async getByPlayer(playerId: string): Promise<Credential | undefined> {
    return this.byPlayer.get(playerId);
  }

  async save(cred: Credential): Promise<void> {
    this.byPlayer.set(cred.playerId, cred);
    this.byDevice.set(cred.deviceId, cred.playerId);
  }
}
