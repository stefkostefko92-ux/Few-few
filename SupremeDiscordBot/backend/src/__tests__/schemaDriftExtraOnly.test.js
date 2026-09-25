// backend/src/__tests__/schemaDriftExtraOnly.test.js
// Rollback след адитивна миграция не бива да спира backend-а, а истинско
// разминаване — да. Изходите по-долу са РЕАЛНИ (`prisma migrate diff` срещу
// Postgres 16, 25.09.2026): база на v50 срещу schema.prisma на 3.4.0; база с
// липсваща колона (инцидентът от 07.08.2026); и двете едновременно.
import { describe, it, expect } from "vitest";
import { extraTablesOnly } from "../../scripts/schema-drift-extra-only.mjs";

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
