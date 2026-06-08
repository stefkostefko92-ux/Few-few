import type { Player } from "../domain/types.js";

/**
 * Persistence boundary. The prototype ships an in-memory implementation so the
 * full game logic runs and is testable with zero external infra; production
 * uses the Prisma/Postgres adapter (see src/data/prismaRepository.ts) behind the
 * same interface. All value-bearing mutations go through the services.
 */
export interface PlayerRepository {
  create(player: Player): Promise<Player>;
  get(id: string): Promise<Player | undefined>;
  getOrThrow(id: string): Promise<Player>;
  save(player: Player): Promise<void>;
  /** All other players — matchmaking candidate pool for attack/raid. */
  others(excludeId: string): Promise<Player[]>;
  /** Hard-delete a player (GDPR erasure). Idempotent — no-op if absent. */
  delete(id: string): Promise<void>;
}

export class PlayerNotFoundError extends Error {
  constructor(id: string) {
    super(`player not found: ${id}`);
    this.name = "PlayerNotFoundError";
  }
}
