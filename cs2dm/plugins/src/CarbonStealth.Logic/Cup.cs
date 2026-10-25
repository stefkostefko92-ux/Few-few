namespace CarbonStealth.Logic;

/// <summary>Една седмица на купата: от понеделник 00:00 до следващия понеделник 00:00 местно време (UTC граници).</summary>
public readonly record struct CupWeek(DateOnly Monday, DateTimeOffset Start, DateTimeOffset End)
{
    /// <summary>Периодът на значките за седмицата (`player_badges.period`) — датата на понеделника.</summary>
    public string Key => MissionPool.DayKey(Monday);
}

/// <summary>
/// Седмичната купа (CONTRACT.md §17): сборът от XP в мачовете (`match_players.xp`), завършили в седмицата (понеделник
/// 00:00 – неделя 23:59 в DisplayTimeZone = DISPLAY_TZ на сайта); скритите играчи (чл. 21 GDPR) не участват. Равен XP →
/// по-малкият SteamID64 е напред. Същото като `app/src/cup.ts` — значките дава работникът на сайта.
/// </summary>
public static class CupRules
{
    public const int Podium = 3;
    public const string WinnerBadge = "cup_winner";
    public const string PodiumBadge = "cup_podium";

    public static CupWeek WeekOf(DateTimeOffset now, TimeZoneInfo zone)
    {
        var day = MissionPool.DayOf(now, zone);
        var monday = day.AddDays(-(((int)day.DayOfWeek + 6) % 7));
        return new CupWeek(monday, StartOf(monday, zone), StartOf(monday.AddDays(7), zone));
    }

    /// <summary>Местната полунощ в UTC. Зона, в която полунощта липсва (смяна на часа в 00:00), → първият валиден час.</summary>
    private static DateTimeOffset StartOf(DateOnly day, TimeZoneInfo zone)
    {
        var local = day.ToDateTime(TimeOnly.MinValue, DateTimeKind.Unspecified);
        while (zone.IsInvalidTime(local)) local = local.AddMinutes(30);
        return new DateTimeOffset(TimeZoneInfo.ConvertTimeToUtc(local, zone), TimeSpan.Zero);
    }
}
