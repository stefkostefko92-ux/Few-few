import type { Player } from "../domain/types.js";
import { PlayerNotFoundError, type PlayerRepository } from "./repository.js";

/** In-memory PlayerRepository (prototype / tests). */
export class MemoryPlayerRepository implements PlayerRepository {
  private readonly players = new Map<string, Player>();

  async create(player: Player): Promise<Player> {
    this.players.set(player.id, player);
    return player;
  }

  async get(id: string): Promise<Player | undefined> {
    return this.players.get(id);
  }

  async getOrThrow(id: string): Promise<Player> {
    const p = this.players.get(id);
    if (!p) throw new PlayerNotFoundError(id);
    return p;
  }

  async save(player: Player): Promise<void> {
    this.players.set(player.id, player);
  }

  async others(excludeId: string): Promise<Player[]> {
    return [...this.players.values()].filter((p) => p.id !== excludeId);
  }

  async delete(id: string): Promise<void> {
    this.players.delete(id);
  }
}
