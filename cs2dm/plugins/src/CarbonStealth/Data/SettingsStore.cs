using System.Text.Json.Nodes;
using Npgsql;
using NpgsqlTypes;

namespace CarbonStealth.Data;

/// <summary>
/// server_settings (CONTRACT.md §11): четене на всички редове и запис на един ред от WASD менюто —
/// заключен ред → запис → одит „settings.change“ с before/after в една транзакция (като панела).
/// </summary>
public static class SettingsStore
{
    public static async Task<Dictionary<string, string>> LoadSettingsAsync(this Database db)
    {
        await using var cmd = db.Source.CreateCommand("SELECT key, value::text FROM server_settings");
        await using var rd = await cmd.ExecuteReaderAsync();
        var rows = new Dictionary<string, string>(StringComparer.Ordinal);
        while (await rd.ReadAsync()) rows[rd.GetString(0)] = rd.GetString(1);
        return rows;
    }

    public static async Task SaveSettingAsync(this Database db, string key, string json, string? actor)
    {
        await using var conn = await db.Source.OpenConnectionAsync();
        await using var tx = await conn.BeginTransactionAsync();
        string? before;
        await using (var sel = new NpgsqlCommand("SELECT value::text FROM server_settings WHERE key = @k FOR UPDATE", conn, tx))
        {
            sel.Parameters.AddWithValue("k", key);
            before = await sel.ExecuteScalarAsync() as string;
        }
        var beforeNode = before is null ? null : JsonNode.Parse(before);
        var afterNode = JsonNode.Parse(json);
        if (JsonNode.DeepEquals(beforeNode, afterNode))
        {
            await tx.RollbackAsync();
            return;
        }
        await using (var up = new NpgsqlCommand("""
            INSERT INTO server_settings (key, value, updated_at, updated_by) VALUES (@k, @v::jsonb, now(), @a)
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by
            """, conn, tx))
        {
            up.Parameters.AddWithValue("k", key);
            up.Parameters.AddWithValue("v", json);
            up.Parameters.Add(new NpgsqlParameter("a", NpgsqlDbType.Varchar) { Value = (object?)actor ?? DBNull.Value });
            await up.ExecuteNonQueryAsync();
        }
        var details = new JsonObject { ["key"] = key, ["before"] = beforeNode, ["after"] = afterNode };
        await Database.AuditAsync(conn, tx, actor, "settings.change", null, details.ToJsonString());
        await tx.CommitAsync();
    }
}
