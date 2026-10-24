using System.Text.Json;
using CarbonStealth.Logic;
using CarbonStealth.State;
using Npgsql;
using NpgsqlTypes;

namespace CarbonStealth.Data;

/// <summary>Какво знае базата за играч при влизане/презареждане.</summary>
public sealed record PlayerSnapshot(Role Role, DateTimeOffset? VipUntil, long Xp, List<ActivePunishment> Punishments, long? SessionId);

/// <summary>
/// Целият достъп до PostgreSQL. Имената на таблици/колони са от schema.prisma (@map) — виж CONTRACT.md.
/// Всички методи са асинхронни и се викат ИЗВЪН игровата нишка.
/// </summary>
public sealed class Database(NpgsqlDataSource source) : IAsyncDisposable
{
    private const string ActivePunishmentsSql = """
        SELECT id, type::text, category::text, expires_at FROM punishments
        WHERE steam_id = @s AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())
        """;

    public static Database Create(string connectionString) => new(NpgsqlDataSource.Create(connectionString));

    public async Task<int> CurrentSeasonAsync()
    {
        await using var cmd = source.CreateCommand(
            "SELECT id FROM seasons WHERE id > 0 AND ends_at IS NULL ORDER BY id DESC LIMIT 1");
        return await cmd.ExecuteScalarAsync() is int id ? id : 0;
    }

    /// <summary>Влизане: играч (upsert), сесия, роля, наказания, VIP, XP — в една транзакция.</summary>
    public async Task<PlayerSnapshot> OnConnectAsync(string steamId, string name, string? ip)
    {
        await using var conn = await source.OpenConnectionAsync();
        await using var tx = await conn.BeginTransactionAsync();

        await using (var up = new NpgsqlCommand("""
            INSERT INTO players (steam_id, name) VALUES (@s, @n)
            ON CONFLICT (steam_id) DO UPDATE SET name = EXCLUDED.name, last_seen_at = now()
            """, conn, tx))
        {
            up.Parameters.AddWithValue("s", steamId);
            up.Parameters.AddWithValue("n", name);
            await up.ExecuteNonQueryAsync();
        }

        long? sessionId;
        await using (var ses = new NpgsqlCommand(
            "INSERT INTO sessions (steam_id, ip) VALUES (@s, @ip::inet) RETURNING id", conn, tx))
        {
            ses.Parameters.AddWithValue("s", steamId);
            ses.Parameters.Add(new NpgsqlParameter("ip", NpgsqlDbType.Text) { Value = (object?)ip ?? DBNull.Value });
            sessionId = await ses.ExecuteScalarAsync() as long?;
        }

        var snapshot = await ReadSnapshotAsync(conn, tx, steamId);
        await tx.CommitAsync();
        return snapshot with { SessionId = sessionId };
    }

    public async Task<PlayerSnapshot> ReloadAsync(string steamId)
    {
        await using var conn = await source.OpenConnectionAsync();
        return await ReadSnapshotAsync(conn, null, steamId);
    }

    private static async Task<PlayerSnapshot> ReadSnapshotAsync(NpgsqlConnection conn, NpgsqlTransaction? tx, string steamId)
    {
        var role = Role.Player;
        await using (var r = new NpgsqlCommand("SELECT role::text FROM players WHERE steam_id = @s", conn, tx))
        {
            r.Parameters.AddWithValue("s", steamId);
            role = Roles.Parse(await r.ExecuteScalarAsync() as string);
        }

        DateTimeOffset? vipUntil = null;
        await using (var v = new NpgsqlCommand("""
            SELECT max(ends_at) FROM vip_grants
            WHERE steam_id = @s AND revoked_at IS NULL AND starts_at <= now() AND ends_at > now()
            """, conn, tx))
        {
            v.Parameters.AddWithValue("s", steamId);
            if (await v.ExecuteScalarAsync() is DateTime dt) vipUntil = new DateTimeOffset(DateTime.SpecifyKind(dt, DateTimeKind.Utc));
        }

        long xp = 0;
        await using (var x = new NpgsqlCommand(
            "SELECT xp FROM player_season_stats WHERE steam_id = @s AND season_id = 0", conn, tx))
        {
            x.Parameters.AddWithValue("s", steamId);
            if (await x.ExecuteScalarAsync() is long l) xp = l;
        }

        var punishments = new List<ActivePunishment>();
        await using (var p = new NpgsqlCommand(ActivePunishmentsSql, conn, tx))
        {
            p.Parameters.AddWithValue("s", steamId);
            await using var rd = await p.ExecuteReaderAsync();
            while (await rd.ReadAsync())
            {
                punishments.Add(new ActivePunishment(
                    rd.GetInt32(0), rd.GetString(1), rd.GetString(2),
                    rd.IsDBNull(3) ? null : new DateTimeOffset(DateTime.SpecifyKind(rd.GetDateTime(3), DateTimeKind.Utc))));
            }
        }

        return new PlayerSnapshot(role, vipUntil, xp, punishments, null);
    }

    public async Task CloseSessionAsync(long sessionId, string steamId, int playtimeSec)
    {
        await using var conn = await source.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand("""
            UPDATE sessions SET disconnected_at = now() WHERE id = @id;
            UPDATE players SET last_seen_at = now() WHERE steam_id = @s;
            """, conn);
        cmd.Parameters.AddWithValue("id", sessionId);
        cmd.Parameters.AddWithValue("s", steamId);
        await cmd.ExecuteNonQueryAsync();
    }

    /// <summary>Ново наказание + одит в една транзакция. Връща id на наказанието.</summary>
    public async Task<int> PunishAsync(string type, string steamId, string targetName, string category, string reason,
        DateTimeOffset? expiresAt, string? actor)
    {
        await using var conn = await source.OpenConnectionAsync();
        await using var tx = await conn.BeginTransactionAsync();
        int id;
        await using (var cmd = new NpgsqlCommand("""
            INSERT INTO punishments (type, steam_id, target_name, category, reason, expires_at, actor_steam_id, source)
            VALUES (@t::"PunishmentType", @s, @n, @c::"PunishmentCategory", @r, @e, @a, 'GAME')
            RETURNING id
            """, conn, tx))
        {
            cmd.Parameters.AddWithValue("t", type);
            cmd.Parameters.AddWithValue("s", steamId);
            cmd.Parameters.AddWithValue("n", targetName);
            cmd.Parameters.AddWithValue("c", category);
            cmd.Parameters.AddWithValue("r", reason);
            cmd.Parameters.Add(new NpgsqlParameter("e", NpgsqlDbType.TimestampTz) { Value = (object?)expiresAt?.UtcDateTime ?? DBNull.Value });
            cmd.Parameters.Add(new NpgsqlParameter("a", NpgsqlDbType.Varchar) { Value = (object?)actor ?? DBNull.Value });
            id = (int)(await cmd.ExecuteScalarAsync() ?? 0);
        }
        await AuditAsync(conn, tx, actor, $"punishment.{type.ToLowerInvariant()}", steamId,
            JsonSerializer.Serialize(new { punishmentId = id, category, expiresAt = expiresAt?.UtcDateTime }));
        await tx.CommitAsync();
        return id;
    }

    /// <summary>Отменя всички активни наказания от дадените видове. Връща броя.</summary>
    public async Task<int> RevokeAsync(string steamId, string[] types, string? actor, string reason)
    {
        await using var conn = await source.OpenConnectionAsync();
        await using var tx = await conn.BeginTransactionAsync();
        int count;
        await using (var cmd = new NpgsqlCommand("""
            UPDATE punishments SET revoked_at = now(), revoked_by = @a, revoke_reason = @r
            WHERE steam_id = @s AND type::text = ANY(@t) AND revoked_at IS NULL
              AND (expires_at IS NULL OR expires_at > now())
            """, conn, tx))
        {
            cmd.Parameters.AddWithValue("s", steamId);
            cmd.Parameters.AddWithValue("t", types);
            cmd.Parameters.Add(new NpgsqlParameter("a", NpgsqlDbType.Varchar) { Value = (object?)actor ?? DBNull.Value });
            cmd.Parameters.AddWithValue("r", reason);
            count = await cmd.ExecuteNonQueryAsync();
        }
        await AuditAsync(conn, tx, actor, "punishment.revoke", steamId, JsonSerializer.Serialize(new { types, count }));
        await tx.CommitAsync();
        return count;
    }

    /// <summary>Наказание по id (команда „punish“ от сайта). null = няма или вече не е активно.</summary>
    public async Task<(string SteamId, ActivePunishment Punishment)?> LoadPunishmentAsync(int id)
    {
        await using var cmd = source.CreateCommand("""
            SELECT steam_id, type::text, category::text, expires_at FROM punishments
            WHERE id = @id AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())
            """);
        cmd.Parameters.AddWithValue("id", id);
        await using var rd = await cmd.ExecuteReaderAsync();
        if (!await rd.ReadAsync()) return null;
        var expires = rd.IsDBNull(3) ? (DateTimeOffset?)null : new DateTimeOffset(DateTime.SpecifyKind(rd.GetDateTime(3), DateTimeKind.Utc));
        return (rd.GetString(0), new ActivePunishment(id, rd.GetString(1), rd.GetString(2), expires));
    }

    public async Task ReportAsync(string? reporter, string target, string targetName, string reason)
    {
        await using var cmd = source.CreateCommand("""
            INSERT INTO reports (reporter_steam_id, target_steam_id, target_name, reason, source)
            VALUES (@r, @t, @n, @why, 'GAME')
            """);
        cmd.Parameters.Add(new NpgsqlParameter("r", NpgsqlDbType.Varchar) { Value = (object?)reporter ?? DBNull.Value });
        cmd.Parameters.AddWithValue("t", target);
        cmd.Parameters.AddWithValue("n", targetName);
        cmd.Parameters.AddWithValue("why", reason);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task AuditAsync(string? actor, string action, string? target, string detailsJson)
    {
        await using var conn = await source.OpenConnectionAsync();
        await AuditAsync(conn, null, actor, action, target, detailsJson);
    }

    internal static async Task AuditAsync(NpgsqlConnection conn, NpgsqlTransaction? tx, string? actor, string action, string? target, string detailsJson)
    {
        // hash/prev_hash ги смята тригерът в базата (CONTRACT.md §6).
        await using var cmd = new NpgsqlCommand("""
            INSERT INTO audit_log (actor_steam_id, action, target_steam_id, details, source)
            VALUES (@a, @act, @t, @d::jsonb, 'GAME')
            """, conn, tx);
        cmd.Parameters.Add(new NpgsqlParameter("a", NpgsqlDbType.Varchar) { Value = (object?)actor ?? DBNull.Value });
        cmd.Parameters.AddWithValue("act", action);
        cmd.Parameters.Add(new NpgsqlParameter("t", NpgsqlDbType.Varchar) { Value = (object?)target ?? DBNull.Value });
        cmd.Parameters.AddWithValue("d", detailsJson);
        await cmd.ExecuteNonQueryAsync();
    }

    public ValueTask DisposeAsync() => source.DisposeAsync();

    internal NpgsqlDataSource Source => source;
}
