using CarbonStealth.Logic;
using Npgsql;
using NpgsqlTypes;

namespace CarbonStealth.Data;

/// <summary>matches + match_players (CONTRACT.md §13): един мач в една транзакция. Връща id за линка в чата.</summary>
public static class MatchStore
{
    internal const string InsertMatchSql = """
        INSERT INTO matches (map, mode, season_id, event_id, xp_multiplier, started_at, ended_at, kills, players)
        VALUES (@map, @mode, @season, @event, @xp, @started, @ended, @kills, @players)
        RETURNING id
        """;

    /// <summary>Играч, изтрит междувременно (право на изтриване), просто липсва — мачът се записва.</summary>
    internal const string InsertPlayerSql = """
        INSERT INTO match_players (match_id, steam_id, name, place, kills, deaths, headshots, best_streak,
          bounties_claimed, xp, top_weapon, top_weapon_kills)
        SELECT @match, @s, @n, @place, @k, @d, @hs, @bs, @bc, @xp, @w, @wk
        WHERE EXISTS (SELECT 1 FROM players WHERE steam_id = @s)
        """;

    public static async Task<int> SaveMatchAsync(this Database db, MatchSummary match, string map, string mode,
        int seasonId, int? eventId, int xpTenths)
    {
        await using var conn = await db.Source.OpenConnectionAsync();
        await using var tx = await conn.BeginTransactionAsync();
        int id;
        await using (var cmd = new NpgsqlCommand(InsertMatchSql, conn, tx))
        {
            cmd.Parameters.AddWithValue("map", map.Length > 64 ? map[..64] : map);
            cmd.Parameters.AddWithValue("mode", mode.Length > 32 ? mode[..32] : mode);
            cmd.Parameters.AddWithValue("season", seasonId);
            cmd.Parameters.Add(new NpgsqlParameter("event", NpgsqlDbType.Integer) { Value = (object?)eventId ?? DBNull.Value });
            cmd.Parameters.AddWithValue("xp", Math.Clamp(xpTenths, 10, 30) / 10m);
            cmd.Parameters.AddWithValue("started", match.StartedAt.UtcDateTime);
            cmd.Parameters.AddWithValue("ended", match.EndedAt.UtcDateTime);
            cmd.Parameters.AddWithValue("kills", match.Kills);
            cmd.Parameters.AddWithValue("players", match.Players.Count);
            id = (int)(await cmd.ExecuteScalarAsync() ?? 0);
        }
        var batch = new NpgsqlBatch(conn, tx);
        foreach (var p in match.Players)
        {
            var c = new NpgsqlBatchCommand(InsertPlayerSql);
            c.Parameters.AddWithValue("match", id);
            c.Parameters.AddWithValue("s", p.SteamId);
            c.Parameters.AddWithValue("n", p.Name);
            c.Parameters.AddWithValue("place", p.Place);
            c.Parameters.AddWithValue("k", p.Kills);
            c.Parameters.AddWithValue("d", p.Deaths);
            c.Parameters.AddWithValue("hs", p.Headshots);
            c.Parameters.AddWithValue("bs", p.BestStreak);
            c.Parameters.AddWithValue("bc", p.BountiesClaimed);
            c.Parameters.AddWithValue("xp", p.Xp);
            c.Parameters.Add(new NpgsqlParameter("w", NpgsqlDbType.Varchar) { Value = (object?)p.TopWeapon ?? DBNull.Value });
            c.Parameters.AddWithValue("wk", p.TopWeaponKills);
            batch.BatchCommands.Add(c);
        }
        if (batch.BatchCommands.Count > 0) await batch.ExecuteNonQueryAsync();
        await batch.DisposeAsync();
        await tx.CommitAsync();
        return id;
    }
}
