import type { AuthRepository } from "../data/authRepository.js";
import type { PurchaseRepository } from "../data/purchaseRepository.js";
import type { PlayerRepository } from "../data/repository.js";
import type { Store } from "../data/store.js";
import type { Player } from "../domain/types.js";
import type { ClanService } from "./clanService.js";

export interface AccountExport {
  exportedAt: number;
  /** Full player save-state (currencies, islands, companions, progression). */
  player: Player;
  /** Device-binding metadata (the secret hash is never exported). */
  account: { deviceId: string; createdAt: number; lastSeenAt: number } | null;
  /** Purchase history. */
  purchases: { transactionId: string; productId: string; platform: string; grantedAt: number }[];
}

export interface AccountServiceDeps {
  store: Store;
  playerRepo: PlayerRepository;
  authRepo: AuthRepository;
  purchaseRepo: PurchaseRepository;
  clan: ClanService;
}

/**
 * GDPR account rights (Art. 15/20 access & portability, Art. 17 erasure).
 * Exposed via authenticated endpoints so a player can download or delete the
 * personal data we hold. Ledger legs are intentionally retained as financial
 * records (Art. 17(3)(b) accounting-obligation exemption) keyed by an opaque id
 * that no longer maps to a person once the Player/Credential rows are gone.
 */
export class AccountService {
  private readonly store: Store;
  private readonly playerRepo: PlayerRepository;
  private readonly authRepo: AuthRepository;
  private readonly purchaseRepo: PurchaseRepository;
  private readonly clan: ClanService;

  constructor(deps: AccountServiceDeps) {
    this.store = deps.store;
    this.playerRepo = deps.playerRepo;
    this.authRepo = deps.authRepo;
    this.purchaseRepo = deps.purchaseRepo;
    this.clan = deps.clan;
  }

  /** Right of access / portability: everything we hold for this player. */
  async exportData(playerId: string): Promise<AccountExport> {
    const player = await this.playerRepo.getOrThrow(playerId);
    const cred = await this.authRepo.getByPlayer(playerId);
    const purchases = await this.purchaseRepo.listByPlayer(playerId);
    return {
      exportedAt: Date.now(),
      player,
      account: cred ? { deviceId: cred.deviceId, createdAt: cred.createdAt, lastSeenAt: cred.lastSeenAt } : null,
      purchases: purchases.map((p) => ({
        transactionId: p.transactionId,
        productId: p.productId,
        platform: p.platform,
        grantedAt: p.grantedAt,
      })),
    };
  }

  /**
   * Right to erasure: delete the player, credential (revoking login), and
   * purchase records, and remove them from any clan. Idempotent — a repeat call
   * is a no-op. Ledger legs are retained (see class docstring).
   */
  async eraseData(playerId: string): Promise<void> {
    const player = await this.playerRepo.get(playerId);
    if (!player) return; // already erased
    if (player.clanId) await this.clan.leaveClan(playerId); // updates clan membership atomically
    await this.store.transaction(async (tx) => {
      await tx.purchases.deleteByPlayer(playerId);
      await tx.players.delete(playerId);
    });
    await this.authRepo.deleteByPlayer(playerId);
  }
}
