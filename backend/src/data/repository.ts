import type { Player } from "../domain/types.js";

/**
 * Persistence boundary. The prototype ships an in-memory implementation so the
 * full game logic runs and is testable with zero external infra; production
 * swaps in a Prisma/Postgres adapter (see prisma/schema.prisma) behind the same
 * interface. All value-bearing mutations go through the services, never here.
 */
export interface PlayerRepository {
  create(player: Player): Player;
  get(id: string): Player | undefined;
  getOrThrow(id: string): Player;
  save(player: Player): void;
  /** All other players — matchmaking candidate pool for attack/raid. */
  others(excludeId: string): Player[];
}

export class PlayerNotFoundError extends Error {
  constructor(id: string) {
    super(`player not found: ${id}`);
    this.name = "PlayerNotFoundError";
  }
}
