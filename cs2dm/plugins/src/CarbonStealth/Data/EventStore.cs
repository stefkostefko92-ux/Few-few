using CarbonStealth.Logic;

namespace CarbonStealth.Data;

/// <summary>events (CONTRACT.md §12): текущото неотменено събитие — едно (застъпването е забранено в базата).</summary>
public static class EventStore
{
    internal const string ActiveEventSql = """
        SELECT id, kind::text, title_bg, title_en, ends_at, xp_multiplier, dm_mode_id FROM events
        WHERE cancelled_at IS NULL AND starts_at <= now() AND ends_at > now()
        ORDER BY starts_at DESC LIMIT 1
        """;

    public static async Task<ActiveEvent?> ActiveEventAsync(this Database db)
    {
        await using var cmd = db.Source.CreateCommand(ActiveEventSql);
        await using var rd = await cmd.ExecuteReaderAsync();
        if (!await rd.ReadAsync()) return null;
        var tenths = (int)Math.Round(rd.GetDecimal(5) * 10m);
        return new ActiveEvent(
            rd.GetInt32(0),
            rd.GetString(1),
            Text.SafeText(rd.GetString(2), 80),
            Text.SafeText(rd.GetString(3), 80),
            new DateTimeOffset(DateTime.SpecifyKind(rd.GetDateTime(4), DateTimeKind.Utc)),
            Math.Clamp(tenths, 10, 30),
            rd.IsDBNull(6) ? null : rd.GetInt32(6));
    }
}
