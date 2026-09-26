// backend/src/__tests__/schemaDriftExtraOnly.test.js
// Rollback след адитивна миграция не бива да спира backend-а, а истинско
// разминаване — да. Изходите по-долу са РЕАЛНИ (`prisma migrate diff` срещу
// Postgres 16, 25.09.2026): база на v50 срещу schema.prisma на 3.4.0; база с
// липсваща колона (инцидентът от 07.08.2026); и двете едновременно.
import { describe, it, expect } from "vitest";
import { extraTablesOnly, extraColumnsSafe } from "../../scripts/schema-drift-extra-only.mjs";

const ROLLBACK_340 = "\n[-] Removed tables\n  - companion_spawns\n  - companion_trades\n  - game_seasons\n  - game_settings\n  - game_xp_grants\n  - member_companions\n  - member_progress\n  - quest_contributions\n  - server_quests\n  - shop_items\n  - shop_purchases\n  - trivia_answers\n  - trivia_rounds\n\n[*] Changed the `companion_spawns` table\n  [-] Removed foreign key on columns (serverId)\n\n[*] Changed the `companion_trades` table\n  [-] Removed foreign key on columns (serverId)\n\n[*] Changed the `game_settings` table\n  [-] Removed foreign key on columns (serverId)\n\n[*] Changed the `game_xp_grants` table\n  [-] Removed foreign key on columns (serverId)\n\n[*] Changed the `member_companions` table\n  [-] Removed foreign key on columns (serverId)\n\n[*] Changed the `member_progress` table\n  [-] Removed foreign key on columns (serverId)\n\n[*] Changed the `quest_contributions` table\n  [-] Removed foreign key on columns (questId)\n\n[*] Changed the `server_quests` table\n  [-] Removed foreign key on columns (serverId)\n\n[*] Changed the `shop_items` table\n  [-] Removed foreign key on columns (serverId)\n\n[*] Changed the `shop_purchases` table\n  [-] Removed foreign key on columns (itemId)\n  [-] Removed foreign key on columns (serverId)\n\n[*] Changed the `trivia_answers` table\n  [-] Removed foreign key on columns (roundId)\n\n[*] Changed the `trivia_rounds` table\n  [-] Removed foreign key on columns (serverId)\n\n";
const MISSING_COLUMN = "\n[*] Changed the `panels` table\n  [+] Added column `groupMode`\n\n";
const ROLLBACK_AND_MISSING = "\n[-] Removed tables\n  - companion_spawns\n  - companion_trades\n  - game_seasons\n  - game_settings\n  - game_xp_grants\n  - member_companions\n  - member_progress\n  - quest_contributions\n  - server_quests\n  - shop_items\n  - shop_purchases\n  - trivia_answers\n  - trivia_rounds\n\n[*] Changed the `companion_spawns` table\n  [-] Removed foreign key on columns (serverId)\n\n[*] Changed the `companion_trades` table\n  [-] Removed foreign key on columns (serverId)\n\n[*] Changed the `game_settings` table\n  [-] Removed foreign key on columns (serverId)\n\n[*] Changed the `game_xp_grants` table\n  [-] Removed foreign key on columns (serverId)\n\n[*] Changed the `member_companions` table\n  [-] Removed foreign key on columns (serverId)\n\n[*] Changed the `member_progress` table\n  [-] Removed foreign key on columns (serverId)\n\n[*] Changed the `panels` table\n  [+] Added column `groupMode`\n\n[*] Changed the `quest_contributions` table\n  [-] Removed foreign key on columns (questId)\n\n[*] Changed the `server_quests` table\n  [-] Removed foreign key on columns (serverId)\n\n[*] Changed the `shop_items` table\n  [-] Removed foreign key on columns (serverId)\n\n[*] Changed the `shop_purchases` table\n  [-] Removed foreign key on columns (itemId)\n  [-] Removed foreign key on columns (serverId)\n\n[*] Changed the `trivia_answers` table\n  [-] Removed foreign key on columns (roundId)\n\n[*] Changed the `trivia_rounds` table\n  [-] Removed foreign key on columns (serverId)\n\n";

describe("entrypoint: разлика само от излишни таблици", () => {
  it("rollback 3.5.0 → 3.4.0: 13-те таблици на v50 и техните FK → безопасно", () => {
    const out = extraTablesOnly(ROLLBACK_340);
    expect(out.ok).toBe(true);
    expect(out.tables).toHaveLength(13);
    expect(out.tables).toContain("member_progress");
  });
  it("липсваща колона → fail-closed", () => {
    expect(extraTablesOnly(MISSING_COLUMN)).toMatchObject({ ok: false });
  });
  it("излишни таблици + липсваща колона → fail-closed", () => {
    expect(extraTablesOnly(ROLLBACK_AND_MISSING)).toMatchObject({ ok: false });
  });
  it("празен/непознат изход → fail-closed", () => {
    expect(extraTablesOnly("").ok).toBe(false);
    expect(extraTablesOnly("Error: P1001 Can't reach database server").ok).toBe(false);
  });
});

// РЕАЛЕН изход (26.09.2026, Postgres 16): база на v51 срещу schema.prisma на 3.5.0.
const ROLLBACK_V51 = "[*] Changed the `servers` table\n  [-] Removed column `customBotPausedAt`\n[*] Changed the `users` table\n  [-] Removed column `adminNote`\n  [-] Removed column `blacklistReason`\n  [-] Removed column `blacklistedAt`\n  [-] Removed column `blacklistedUntil`\n";

describe("entrypoint: излишни колони (v51)", () => {
  it("rollback v51 → 3.5.0: петте nullable колони се разпознават като излишни", () => {
    const out = extraTablesOnly(ROLLBACK_V51);
    expect(out.ok).toBe(true);
    expect(out.tables).toEqual([]);
    expect(out.columns.map((c) => `${c.table}.${c.column}`)).toEqual([
      "servers.customBotPausedAt", "users.adminNote", "users.blacklistReason", "users.blacklistedAt", "users.blacklistedUntil",
    ]);
  });
  it("колоната е безопасна само ако е nullable или с DEFAULT; иначе/при грешка → fail-closed", async () => {
    const cols = [{ table: "users", column: "a" }, { table: "users", column: "b" }];
    expect(await extraColumnsSafe(cols, async (_t, c) => (c === "a" ? { is_nullable: "YES", column_default: null } : { is_nullable: "NO", column_default: "'x'" }))).toEqual({ ok: true });
    expect((await extraColumnsSafe(cols, async () => ({ is_nullable: "NO", column_default: null }))).ok).toBe(false);
    expect((await extraColumnsSafe(cols, async () => null)).ok).toBe(false);
    expect((await extraColumnsSafe(cols, async () => { throw new Error("db down"); })).ok).toBe(false);
  });
  it("липсваща колона остава fail-closed и когато има излишни колони", () => {
    expect(extraTablesOnly(ROLLBACK_V51 + "[*] Changed the `panels` table\n  [+] Added column `groupMode`\n").ok).toBe(false);
  });
});

