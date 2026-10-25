using CarbonStealth.Logic;

namespace CarbonStealth.Data;

/// <summary>Ред от класирането на купата за `!cup`.</summary>
public sealed record CupRow(int Place, string SteamId, string Name, int Xp);

/// <summary>
/// Седмичната купа (CONTRACT.md §17) за `!cup`: сборът от `match_players.xp` в мачовете, завършили в седмицата; скритите
/// (чл. 21 GDPR) не участват; равен XP → по-малкият SteamID64. Същата подредба като `cupStandings` на сайта — тества
/// го `app/tests/integration-cup.test.ts` срещу истинската база. Извиква се ИЗВЪН игровата нишка.
/// </summary>
public static class CupStore
{
    /// <summary>Първите @podium + редът на играча @s (ако го има).</summary>
    internal const string CupStandingsSql = """
        WITH standings AS (
          SELECT mp.steam_id, sum(mp.xp)::int AS xp
          FROM match_players mp
          JOIN matches m ON m.id = mp.match_id
          JOIN players p ON p.steam_id = mp.steam_id
          WHERE m.ended_at >= @from AND m.ended_at < @to AND NOT p.hidden_from_leaderboards
          GROUP BY mp.steam_id
          HAVING sum(mp.xp) > 0
        ), ranked AS (
          SELECT steam_id, xp, (row_number() OVER (ORDER BY xp DESC, steam_id))::int AS place
          FROM standings
        )
        SELECT r.place, r.steam_id, p.name, r.xp
        FROM ranked r
        JOIN players p ON p.steam_id = r.steam_id
        WHERE r.place <= @podium::int OR r.steam_id = @s
        ORDER BY r.place
        """;

    public static async Task<List<CupRow>> CupStandingsAsync(this Database db, string steamId, CupWeek week)
    {
        await using var cmd = db.Source.CreateCommand(CupStandingsSql);
        cmd.Parameters.AddWithValue("from", week.Start.UtcDateTime);
        cmd.Parameters.AddWithValue("to", week.End.UtcDateTime);
        cmd.Parameters.AddWithValue("podium", CupRules.Podium);
        cmd.Parameters.AddWithValue("s", steamId);
        await using var rd = await cmd.ExecuteReaderAsync();
        var list = new List<CupRow>();
        while (await rd.ReadAsync()) list.Add(new CupRow(rd.GetInt32(0), rd.GetString(1), rd.GetString(2), rd.GetInt32(3)));
        return list;
    }
}
