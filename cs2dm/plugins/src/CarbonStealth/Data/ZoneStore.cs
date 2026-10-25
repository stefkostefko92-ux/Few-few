using System.Text.Json;
using CarbonStealth.Logic;
using Npgsql;
using NpgsqlTypes;

namespace CarbonStealth.Data;

/// <summary>
/// Горещата зона (CONTRACT.md §15): зоните на картата (`map_zones`, промените — с одит), резервната зона от
/// убийствата и значката „Крал на зоната“ (`player_badges`). SQL-ът е в константи — тества го
/// `app/tests/integration-zones.test.ts` срещу истинската база. Извиква се ИЗВЪН игровата нишка.
/// </summary>
public static class ZoneStore
{
    internal const string ListZonesSql = """
        SELECT id, name, x, y, z, radius FROM map_zones WHERE map = @m ORDER BY id
        """;

    internal const string InsertZoneSql = """
        INSERT INTO map_zones (map, name, x, y, z, radius, created_by)
        VALUES (@m, @n, @x, @y, @z, @r, @a) RETURNING id
        """;

    internal const string DeleteZoneSql = """
        DELETE FROM map_zones WHERE id = @id AND map = @m RETURNING name
        """;

    /// <summary>
    /// Най-гъстата клетка от решетката на heatmap-а (32 px, §4) с „етаж“ по височина — по позициите на
    /// жертвите в прозореца. Центърът е средната точка на убийствата в нея. Няма достатъчно → без ред.
    /// </summary>
    internal const string DensestCellSql = """
        SELECT count(*)::int AS n, avg(vx)::real AS x, avg(vy)::real AS y, avg(vz)::real AS z
        FROM (
          SELECT vx, vy, vz,
                 floor((vx - @px) / @cell)::int AS cx,
                 floor((@py - vy) / @cell)::int AS cy,
                 floor(vz / @band)::int AS cz
          FROM kills
          WHERE at >= @since AND at < @until
        ) k
        WHERE cx BETWEEN 0 AND @last AND cy BETWEEN 0 AND @last
        GROUP BY cx, cy, cz
        HAVING count(*) >= @min
        ORDER BY count(*) DESC, cx, cy, cz
        LIMIT 1
        """;

    /// <summary>Играч, изтрит междувременно (право на изтриване), просто не получава значка.</summary>
    internal const string InsertBadgeSql = """
        INSERT INTO player_badges (steam_id, kind, details)
        SELECT @s, @k, @d::jsonb
        WHERE EXISTS (SELECT 1 FROM players WHERE steam_id = @s)
        """;

    public const string ZoneKingBadge = "zone_king";

    public static async Task<List<HotZoneSpot>> ListZonesAsync(this Database db, string map)
    {
        await using var cmd = db.Source.CreateCommand(ListZonesSql);
        cmd.Parameters.AddWithValue("m", map);
        await using var rd = await cmd.ExecuteReaderAsync();
        var list = new List<HotZoneSpot>();
        while (await rd.ReadAsync())
        {
            list.Add(new HotZoneSpot(rd.GetInt32(0), rd.GetString(1), rd.GetFloat(2), rd.GetFloat(3), rd.GetFloat(4),
                rd.GetInt32(5)));
        }
        return list;
    }

    public static async Task<int> AddZoneAsync(this Database db, string map, string name, float x, float y, float z,
        int radius, string? actor)
    {
        await using var conn = await db.Source.OpenConnectionAsync();
        await using var tx = await conn.BeginTransactionAsync();
        int id;
        await using (var cmd = new NpgsqlCommand(InsertZoneSql, conn, tx))
        {
            cmd.Parameters.AddWithValue("m", map);
            cmd.Parameters.AddWithValue("n", name);
            cmd.Parameters.AddWithValue("x", x);
            cmd.Parameters.AddWithValue("y", y);
            cmd.Parameters.AddWithValue("z", z);
            cmd.Parameters.AddWithValue("r", radius);
            cmd.Parameters.Add(new NpgsqlParameter("a", NpgsqlDbType.Varchar) { Value = (object?)actor ?? DBNull.Value });
            id = (int)(await cmd.ExecuteScalarAsync() ?? 0);
        }
        await Database.AuditAsync(conn, tx, actor, "zone.add", null, JsonSerializer.Serialize(new { id, map, name, radius }));
        await tx.CommitAsync();
        return id;
    }

    /// <summary>Маха зона от дадената карта. false = няма такава.</summary>
    public static async Task<bool> RemoveZoneAsync(this Database db, int id, string map, string? actor)
    {
        await using var conn = await db.Source.OpenConnectionAsync();
        await using var tx = await conn.BeginTransactionAsync();
        string? name;
        await using (var cmd = new NpgsqlCommand(DeleteZoneSql, conn, tx))
        {
            cmd.Parameters.AddWithValue("id", id);
            cmd.Parameters.AddWithValue("m", map);
            name = await cmd.ExecuteScalarAsync() as string;
        }
        if (name is null) return false;
        await Database.AuditAsync(conn, tx, actor, "zone.remove", null, JsonSerializer.Serialize(new { id, map, name }));
        await tx.CommitAsync();
        return true;
    }

    /// <summary>Резервната зона на de_dust2: най-гъстата клетка за последните 7 дни, кръстена на сектора („C4“).</summary>
    public static async Task<HotZoneSpot?> DensestZoneAsync(this Database db, DateTimeOffset now)
    {
        await using var cmd = db.Source.CreateCommand(DensestCellSql);
        cmd.Parameters.AddWithValue("px", (double)Dust2Grid.PosX);
        cmd.Parameters.AddWithValue("py", (double)Dust2Grid.PosY);
        cmd.Parameters.AddWithValue("cell", Dust2Grid.CellUnits);
        cmd.Parameters.AddWithValue("band", HotZoneRules.HeightBand);
        cmd.Parameters.AddWithValue("since", now.AddDays(-HotZoneRules.FallbackDays).UtcDateTime);
        cmd.Parameters.AddWithValue("until", now.UtcDateTime);
        cmd.Parameters.AddWithValue("last", Dust2Grid.Grid - 1);
        cmd.Parameters.AddWithValue("min", (long)HotZoneRules.FallbackMinKills);
        await using var rd = await cmd.ExecuteReaderAsync();
        if (!await rd.ReadAsync()) return null;
        var (x, y, z) = (rd.GetFloat(1), rd.GetFloat(2), rd.GetFloat(3));
        return Dust2Grid.SectorLabel(x, y) is { } label
            ? new HotZoneSpot(0, label, x, y, z, HotZoneRules.DefaultRadius)
            : null;
    }

    public static async Task AddBadgeAsync(this Database db, string steamId, string kind, object details)
    {
        await using var cmd = db.Source.CreateCommand(InsertBadgeSql);
        cmd.Parameters.AddWithValue("s", steamId);
        cmd.Parameters.AddWithValue("k", kind);
        cmd.Parameters.Add(new NpgsqlParameter("d", NpgsqlDbType.Text) { Value = JsonSerializer.Serialize(details) });
        await cmd.ExecuteNonQueryAsync();
    }
}
