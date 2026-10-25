using CarbonStealth.Logic;
using Npgsql;
using NpgsqlTypes;

namespace CarbonStealth.Data;

/// <summary>
/// Мисиите за деня (CONTRACT.md §16): `mission_progress` и значката „7 дни подред“ (`player_badges`,
/// `mission_streak`). Напредъкът е абсолютен — GREATEST/COALESCE правят повторената партида безвредна. SQL-ът е в
/// константи — тества го `app/tests/integration-missions.test.ts` срещу истинската база. Извиква се ИЗВЪН игровата
/// нишка.
/// </summary>
public static class MissionStore
{
    internal const string LoadMissionsSql = """
        SELECT mission_key, progress, completed_at FROM mission_progress
        WHERE steam_id = @s AND day = @d::date
        """;

    /// <summary>Играч, изтрит междувременно (право на изтриване) — без ред.</summary>
    internal const string UpsertMissionSql = """
        INSERT INTO mission_progress (steam_id, day, mission_key, target, progress, completed_at)
        SELECT @s, @d::date, @k, @t::int, @p::int, @c::timestamptz
        WHERE EXISTS (SELECT 1 FROM players WHERE steam_id = @s)
        ON CONFLICT (steam_id, day, mission_key) DO UPDATE SET
          progress = GREATEST(mission_progress.progress, EXCLUDED.progress),
          completed_at = COALESCE(mission_progress.completed_at, EXCLUDED.completed_at),
          updated_at = now()
        """;

    /// <summary>
    /// Серията, която свършва в деня @d: дните подред (без дупка до @d), в които са изпълнени поне @per мисии. На
    /// всеки @need дни (7, 14, 21…) — значка с периода = деня; уникалността (играч, вид, период) я прави
    /// идемпотентна. Връща дните на новата значка или нищо.
    /// </summary>
    internal const string StreakBadgeSql = """
        INSERT INTO player_badges (steam_id, kind, period, details)
        SELECT @s, 'mission_streak', to_char(@d::date, 'YYYY-MM-DD'), jsonb_build_object('days', streak.n)
        FROM (
          SELECT count(*)::int AS n
          FROM (
            SELECT full_days.day,
                   (@d::date - full_days.day) AS gap,
                   (row_number() OVER (ORDER BY full_days.day DESC) - 1)::int AS rn
            FROM (
              SELECT day FROM mission_progress
              WHERE steam_id = @s AND day <= @d::date AND completed_at IS NOT NULL
              GROUP BY day
              HAVING count(*) >= @per::int
            ) full_days
          ) ranked
          WHERE ranked.gap = ranked.rn
        ) streak
        WHERE streak.n >= @need::int AND streak.n % @need::int = 0
          AND EXISTS (SELECT 1 FROM players WHERE steam_id = @s)
        ON CONFLICT (steam_id, kind, period) DO NOTHING
        RETURNING (details->>'days')::int
        """;

    public static async Task<List<SavedMission>> LoadMissionsAsync(this Database db, string steamId, DateOnly day)
    {
        await using var cmd = db.Source.CreateCommand(LoadMissionsSql);
        cmd.Parameters.AddWithValue("s", steamId);
        cmd.Parameters.AddWithValue("d", day);
        await using var rd = await cmd.ExecuteReaderAsync();
        var list = new List<SavedMission>();
        while (await rd.ReadAsync())
        {
            list.Add(new SavedMission(rd.GetString(0), rd.GetInt32(1),
                rd.IsDBNull(2) ? null : new DateTimeOffset(DateTime.SpecifyKind(rd.GetDateTime(2), DateTimeKind.Utc))));
        }
        return list;
    }

    /// <summary>Партидата в една транзакция: напредъкът, после серията. Връща новите значки (играч, дни).</summary>
    public static async Task<List<(string SteamId, int Days)>> FlushMissionsAsync(this Database db, MissionBatch batch)
    {
        var awarded = new List<(string, int)>();
        if (batch.IsEmpty) return awarded;
        await using var conn = await db.Source.OpenConnectionAsync();
        await using var tx = await conn.BeginTransactionAsync();
        if (batch.Rows.Count > 0)
        {
            await using var cmds = new NpgsqlBatch(conn, tx);
            foreach (var row in batch.Rows.Values)
            {
                var c = new NpgsqlBatchCommand(UpsertMissionSql);
                c.Parameters.AddWithValue("s", row.SteamId);
                c.Parameters.AddWithValue("d", row.Day);
                c.Parameters.AddWithValue("k", row.Key);
                c.Parameters.AddWithValue("t", row.Target);
                c.Parameters.AddWithValue("p", row.Progress);
                c.Parameters.Add(new NpgsqlParameter("c", NpgsqlDbType.TimestampTz)
                {
                    Value = (object?)row.CompletedAt?.UtcDateTime ?? DBNull.Value,
                });
                cmds.BatchCommands.Add(c);
            }
            await cmds.ExecuteNonQueryAsync();
        }
        foreach (var (steamId, day) in batch.StreakChecks)
        {
            await using var cmd = new NpgsqlCommand(StreakBadgeSql, conn, tx);
            cmd.Parameters.AddWithValue("s", steamId);
            cmd.Parameters.AddWithValue("d", day);
            cmd.Parameters.AddWithValue("per", MissionPool.PerDay);
            cmd.Parameters.AddWithValue("need", MissionPool.StreakBadgeDays);
            if (await cmd.ExecuteScalarAsync() is int days) awarded.Add((steamId, days));
        }
        await tx.CommitAsync();
        return awarded;
    }
}
