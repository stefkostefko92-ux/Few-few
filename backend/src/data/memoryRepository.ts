import type { Player } from "../domain/types.js";
import { PlayerNotFoundError, type PlayerRepository } from "./repository.js";

/** In-memory PlayerRepository (prototype / tests). */
export class MemoryPlayerRepository implements PlayerRepository {
  private readonly players = new Map<string, Player>();

  create(player: Player): Player {
    this.players.set(player.id, player);
    return player;
  }

  get(id: string): Player | undefined {
    return this.players.get(id);
  }

  getOrThrow(id: string): Player {
    const p = this.players.get(id);
    if (!p) throw new PlayerNotFoundError(id);
    return p;
  }

  save(player: Player): void {
    this.players.set(player.id, player);
  }

  others(excludeId: string): Player[] {
    return [...this.players.values()].filter((p) => p.id !== excludeId);
  }
}
