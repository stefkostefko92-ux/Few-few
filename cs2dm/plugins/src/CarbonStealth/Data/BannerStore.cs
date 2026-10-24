using System.Text.Json;
using CarbonStealth.Logic;
using Npgsql;
using NpgsqlTypes;

namespace CarbonStealth.Data;

/// <summary>Банер, поставен в карта (таблица map_banners).</summary>
public sealed record StoredBanner(int Id, string Key, Placement Placement);

/// <summary>Банерите по карти. Промените минават през одит-веригата. Извиква се ИЗВЪН игровата нишка.</summary>
public sealed class BannerStore(NpgsqlDataSource source)
{
    public async Task<List<StoredBanner>> ListAsync(string map)
    {
        await using var cmd = source.CreateCommand(
            "SELECT id, banner_key, x, y, z, pitch, yaw, roll FROM map_banners WHERE map = @m ORDER BY id");
        cmd.Parameters.AddWithValue("m", map);
        await using var rd = await cmd.ExecuteReaderAsync();
        var list = new List<StoredBanner>();
        while (await rd.ReadAsync())
        {
            list.Add(new StoredBanner(rd.GetInt32(0), rd.GetString(1), new Placement(
                rd.GetFloat(2), rd.GetFloat(3), rd.GetFloat(4), rd.GetFloat(5), rd.GetFloat(6), rd.GetFloat(7))));
        }
        return list;
    }

    public async Task<int> AddAsync(string map, string key, Placement p, string? actor)
    {
        await using var conn = await source.OpenConnectionAsync();
        await using var tx = await conn.BeginTransactionAsync();
        int id;
        await using (var cmd = new NpgsqlCommand("""
            INSERT INTO map_banners (map, banner_key, x, y, z, pitch, yaw, roll, created_by)
            VALUES (@m, @k, @x, @y, @z, @p, @yw, @r, @a) RETURNING id
            """, conn, tx))
        {
            cmd.Parameters.AddWithValue("m", map);
            cmd.Parameters.AddWithValue("k", key);
            cmd.Parameters.AddWithValue("x", p.X);
            cmd.Parameters.AddWithValue("y", p.Y);
            cmd.Parameters.AddWithValue("z", p.Z);
            cmd.Parameters.AddWithValue("p", p.Pitch);
            cmd.Parameters.AddWithValue("yw", p.Yaw);
            cmd.Parameters.AddWithValue("r", p.Roll);
            cmd.Parameters.Add(new NpgsqlParameter("a", NpgsqlDbType.Varchar) { Value = (object?)actor ?? DBNull.Value });
            id = (int)(await cmd.ExecuteScalarAsync() ?? 0);
        }
        await Database.AuditAsync(conn, tx, actor, "banner.add", null, JsonSerializer.Serialize(new { id, map, key }));
        await tx.CommitAsync();
        return id;
    }

    /// <summary>Маха банер от дадената карта. false = няма такъв.</summary>
    public async Task<bool> RemoveAsync(int id, string map, string? actor)
    {
        await using var conn = await source.OpenConnectionAsync();
        await using var tx = await conn.BeginTransactionAsync();
        string? key;
        await using (var cmd = new NpgsqlCommand(
            "DELETE FROM map_banners WHERE id = @id AND map = @m RETURNING banner_key", conn, tx))
        {
            cmd.Parameters.AddWithValue("id", id);
            cmd.Parameters.AddWithValue("m", map);
            key = await cmd.ExecuteScalarAsync() as string;
        }
        if (key is null) return false;
        await Database.AuditAsync(conn, tx, actor, "banner.remove", null, JsonSerializer.Serialize(new { id, map, key }));
        await tx.CommitAsync();
        return true;
    }
}
