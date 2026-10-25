using CarbonStealth.Logic;

namespace CarbonStealth.Data;

/// <summary>`duels` (CONTRACT.md §15): един ред на завършен дуел (отменените не се пишат). Срок 90 дни (§7).</summary>
public static class DuelStore
{
    /// <summary>Играч, изтрит междувременно (право на изтриване) — дуелът просто не се записва.</summary>
    internal const string InsertDuelSql = """
        INSERT INTO duels (winner_id, loser_id, winner_score, loser_score, draw, started_at, ended_at)
        SELECT @w, @l, @ws, @ls, @draw, @started, @ended
        WHERE EXISTS (SELECT 1 FROM players WHERE steam_id = @w)
          AND EXISTS (SELECT 1 FROM players WHERE steam_id = @l)
        """;

    public static async Task SaveDuelAsync(this Database db, DuelResult r)
    {
        if (r.Outcome == DuelOutcome.Cancelled) return;
        await using var cmd = db.Source.CreateCommand(InsertDuelSql);
        cmd.Parameters.AddWithValue("w", r.WinnerId);
        cmd.Parameters.AddWithValue("l", r.LoserId);
        cmd.Parameters.AddWithValue("ws", r.WinnerScore);
        cmd.Parameters.AddWithValue("ls", r.LoserScore);
        cmd.Parameters.AddWithValue("draw", r.Outcome == DuelOutcome.Draw);
        cmd.Parameters.AddWithValue("started", r.StartedAt.UtcDateTime);
        cmd.Parameters.AddWithValue("ended", r.EndedAt.UtcDateTime);
        await cmd.ExecuteNonQueryAsync();
    }
}
