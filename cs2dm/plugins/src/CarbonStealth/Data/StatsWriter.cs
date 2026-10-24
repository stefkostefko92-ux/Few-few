using Npgsql;
using NpgsqlTypes;

namespace CarbonStealth.Data;

/// <summary>Записва партида статистики в една транзакция: агрегатите за сезон 0 и текущия сезон + суровите убийства.</summary>
public static class StatsWriter
{
    private const string PlayerUpsert = """
        INSERT INTO players (steam_id, name) VALUES (@s, @n)
        ON CONFLICT (steam_id) DO UPDATE SET name = EXCLUDED.name,
          playtime_sec = players.playtime_sec + @pt, last_seen_at = now()
        """;

    private const string StatsUpsert = """
        INSERT INTO player_season_stats (steam_id, season_id, kills, deaths, headshots, assists, damage,
          shots_fired, shots_hit, best_streak, bounties_claimed, revenges, xp, playtime_sec, updated_at)
        VALUES (@s, @season, @k, @d, @hs, @a, @dmg, @sf, @sh, @bs, @bc, @rv, @xp, @pt, now())
        ON CONFLICT (steam_id, season_id) DO UPDATE SET
          kills = player_season_stats.kills + EXCLUDED.kills,
          deaths = player_season_stats.deaths + EXCLUDED.deaths,
          headshots = player_season_stats.headshots + EXCLUDED.headshots,
          assists = player_season_stats.assists + EXCLUDED.assists,
          damage = player_season_stats.damage + EXCLUDED.damage,
          shots_fired = player_season_stats.shots_fired + EXCLUDED.shots_fired,
          shots_hit = player_season_stats.shots_hit + EXCLUDED.shots_hit,
          best_streak = GREATEST(player_season_stats.best_streak, EXCLUDED.best_streak),
          bounties_claimed = player_season_stats.bounties_claimed + EXCLUDED.bounties_claimed,
          revenges = player_season_stats.revenges + EXCLUDED.revenges,
          xp = player_season_stats.xp + EXCLUDED.xp,
          playtime_sec = player_season_stats.playtime_sec + EXCLUDED.playtime_sec,
          updated_at = now()
        """;

    private const string WeaponUpsert = """
        INSERT INTO weapon_season_stats (steam_id, season_id, weapon, kills, headshots)
        VALUES (@s, @season, @w, @k, @hs)
        ON CONFLICT (steam_id, season_id, weapon) DO UPDATE SET
          kills = weapon_season_stats.kills + EXCLUDED.kills,
          headshots = weapon_season_stats.headshots + EXCLUDED.headshots
        """;

    public static async Task FlushAsync(this Database db, StatsBatch batch, int seasonId)
    {
        if (batch.IsEmpty) return;
        var seasons = seasonId > 0 ? new[] { 0, seasonId } : new[] { 0 };

        await using var conn = await db.Source.OpenConnectionAsync();
        await using var tx = await conn.BeginTransactionAsync();

        var cmds = new NpgsqlBatch(conn, tx);
        foreach (var (steamId, d) in batch.Players)
        {
            var p = new NpgsqlBatchCommand(PlayerUpsert);
            p.Parameters.AddWithValue("s", steamId);
            p.Parameters.AddWithValue("n", d.Name.Length > 0 ? d.Name : "player");
            p.Parameters.AddWithValue("pt", d.PlaytimeSec);
            cmds.BatchCommands.Add(p);

            foreach (var season in seasons)
            {
                var c = new NpgsqlBatchCommand(StatsUpsert);
                c.Parameters.AddWithValue("s", steamId);
                c.Parameters.AddWithValue("season", season);
                c.Parameters.AddWithValue("k", d.Kills);
                c.Parameters.AddWithValue("d", d.Deaths);
                c.Parameters.AddWithValue("hs", d.Headshots);
                c.Parameters.AddWithValue("a", d.Assists);
                c.Parameters.AddWithValue("dmg", d.Damage);
                c.Parameters.AddWithValue("sf", d.ShotsFired);
                c.Parameters.AddWithValue("sh", d.ShotsHit);
                c.Parameters.AddWithValue("bs", d.BestStreak);
                c.Parameters.AddWithValue("bc", d.BountiesClaimed);
                c.Parameters.AddWithValue("rv", d.Revenges);
                c.Parameters.AddWithValue("xp", d.Xp);
                c.Parameters.AddWithValue("pt", d.PlaytimeSec);
                cmds.BatchCommands.Add(c);
            }
        }
        foreach (var ((steamId, weapon), (kills, headshots)) in batch.Weapons)
        {
            foreach (var season in seasons)
            {
                var w = new NpgsqlBatchCommand(WeaponUpsert);
                w.Parameters.AddWithValue("s", steamId);
                w.Parameters.AddWithValue("season", season);
                w.Parameters.AddWithValue("w", weapon);
                w.Parameters.AddWithValue("k", kills);
                w.Parameters.AddWithValue("hs", headshots);
                cmds.BatchCommands.Add(w);
            }
        }
        if (cmds.BatchCommands.Count > 0) await cmds.ExecuteNonQueryAsync();
        await cmds.DisposeAsync();

        if (batch.Kills.Count > 0)
        {
            await using var importer = await conn.BeginBinaryImportAsync("""
                COPY kills (at, season_id, mode, attacker_id, victim_id, weapon, headshot, wallbang, noscope,
                  through_smoke, attacker_blind, distance, ax, ay, az, vx, vy, vz) FROM STDIN (FORMAT BINARY)
                """);
            foreach (var k in batch.Kills)
            {
                await importer.StartRowAsync();
                await importer.WriteAsync(k.At.UtcDateTime, NpgsqlDbType.TimestampTz);
                await importer.WriteAsync(seasonId, NpgsqlDbType.Integer);
                await importer.WriteAsync(k.Mode, NpgsqlDbType.Varchar);
                if (k.AttackerId is null) await importer.WriteNullAsync();
                else await importer.WriteAsync(k.AttackerId, NpgsqlDbType.Varchar);
                await importer.WriteAsync(k.VictimId, NpgsqlDbType.Varchar);
                await importer.WriteAsync(k.Weapon, NpgsqlDbType.Varchar);
                await importer.WriteAsync(k.Headshot, NpgsqlDbType.Boolean);
                await importer.WriteAsync(k.Wallbang, NpgsqlDbType.Boolean);
                await importer.WriteAsync(k.Noscope, NpgsqlDbType.Boolean);
                await importer.WriteAsync(k.ThroughSmoke, NpgsqlDbType.Boolean);
                await importer.WriteAsync(k.AttackerBlind, NpgsqlDbType.Boolean);
                await importer.WriteAsync(k.Distance, NpgsqlDbType.Real);
                await importer.WriteAsync(k.Ax, NpgsqlDbType.Real);
                await importer.WriteAsync(k.Ay, NpgsqlDbType.Real);
                await importer.WriteAsync(k.Az, NpgsqlDbType.Real);
                await importer.WriteAsync(k.Vx, NpgsqlDbType.Real);
                await importer.WriteAsync(k.Vy, NpgsqlDbType.Real);
                await importer.WriteAsync(k.Vz, NpgsqlDbType.Real);
            }
            await importer.CompleteAsync();
        }

        await tx.CommitAsync();
    }
}
