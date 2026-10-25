using System.Globalization;
using System.Text;

namespace CarbonStealth.Logic;

/// <summary>Какво брои една мисия (CONTRACT.md §16). Името с малки букви е началото на ключа („headshots_10“).</summary>
public enum MissionKind
{
    Headshots,
    Rifle,
    Smg,
    Pistol,
    Sniper,
    Knife,
    Wallbang,
    Smoke,
    Noscope,
    Streak,
    Zone,
    Wanted,
    Duel,
    Minutes,
}

/// <summary>Една мисия от пула: ключ „&lt;вид&gt;_&lt;цел&gt;“, целта и трудността (0 лесна · 1 средна · 2 трудна).</summary>
public sealed record MissionDef(string Key, MissionKind Kind, int Target, int Tier)
{
    /// <summary>Видът за текстовете („mission.headshots“ в играта, „missions.kinds.headshots“ на сайта).</summary>
    public string KindKey => Key[..Key.LastIndexOf('_')];

    public int Xp => Progression.MissionXp(Tier);
}

/// <summary>
/// Мисиите за деня (CONTRACT.md §16): по една от всяка трудност, избрана детерминистично от пула по SteamID64 и
/// деня (местната дата в DISPLAY_TZ, по подразбиране Europe/Sofia) — плъгинът и сайтът стигат до едни и същи три
/// без да се питат. Хешът е FNV-1a 32 върху UTF-8 на „&lt;steamId&gt;:&lt;yyyy-MM-dd&gt;:&lt;трудност&gt;“, индексът е
/// хешът по модул дължината на пула. Същото е в `app/src/missions.ts` — тестовите вектори са и в двата.
/// Нов ред в пула мести мисиите на всички за деня → пулът се сменя само заедно с TS и текстовете.
/// </summary>
public static class MissionPool
{
    public const int PerDay = 3;

    /// <summary>Дни подред с трите мисии изпълнени → значка `mission_streak` (на 7, 14, 21…).</summary>
    public const int StreakBadgeDays = 7;

    public const string StreakBadge = "mission_streak";

    public static readonly MissionDef[][] Tiers =
    [
        [
            new("headshots_10", MissionKind.Headshots, 10, 0),
            new("pistol_10", MissionKind.Pistol, 10, 0),
            new("smg_10", MissionKind.Smg, 10, 0),
            new("rifle_15", MissionKind.Rifle, 15, 0),
            new("streak_5", MissionKind.Streak, 5, 0),
            new("minutes_30", MissionKind.Minutes, 30, 0),
        ],
        [
            new("headshots_25", MissionKind.Headshots, 25, 1),
            new("rifle_30", MissionKind.Rifle, 30, 1),
            new("sniper_10", MissionKind.Sniper, 10, 1),
            new("wallbang_1", MissionKind.Wallbang, 1, 1),
            new("smoke_1", MissionKind.Smoke, 1, 1),
            new("zone_3", MissionKind.Zone, 3, 1),
            new("minutes_60", MissionKind.Minutes, 60, 1),
        ],
        [
            new("knife_1", MissionKind.Knife, 1, 2),
            new("noscope_1", MissionKind.Noscope, 1, 2),
            new("wanted_1", MissionKind.Wanted, 1, 2),
            new("duel_1", MissionKind.Duel, 1, 2),
            new("streak_10", MissionKind.Streak, 10, 2),
            new("headshots_50", MissionKind.Headshots, 50, 2),
        ],
    ];

    private static readonly Dictionary<string, MissionDef> ByKey =
        Tiers.SelectMany(t => t).ToDictionary(d => d.Key, StringComparer.Ordinal);

    public static MissionDef? Find(string key) => ByKey.GetValueOrDefault(key);

    public static uint Fnv1a(string text)
    {
        var hash = 2166136261u;
        foreach (var b in Encoding.UTF8.GetBytes(text))
        {
            hash ^= b;
            hash *= 16777619u;
        }
        return hash;
    }

    public static string DayKey(DateOnly day) => day.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

    /// <summary>Местната дата в зоната (границата на деня е местната полунощ).</summary>
    public static DateOnly DayOf(DateTimeOffset now, TimeZoneInfo zone) =>
        DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(now, zone).DateTime);

    /// <summary>Трите мисии на играча за деня — лесна, средна, трудна.</summary>
    public static IReadOnlyList<MissionDef> Assign(string steamId64, DateOnly day)
    {
        var key = DayKey(day);
        var list = new List<MissionDef>(Tiers.Length);
        for (var tier = 0; tier < Tiers.Length; tier++)
        {
            var pool = Tiers[tier];
            list.Add(pool[(int)(Fnv1a($"{steamId64}:{key}:{tier}") % (uint)pool.Length)]);
        }
        return list;
    }

    /// <summary>
    /// Зоната за границата на деня; непозната (липсва tzdata) → Europe/Sofia, после UTC — играта не спира
    /// заради часовата зона. null за грешката = намерена.
    /// </summary>
    public static (TimeZoneInfo Zone, string? Error) ResolveZone(string id)
    {
        foreach (var candidate in new[] { id, "Europe/Sofia" })
        {
            try
            {
                return (TimeZoneInfo.FindSystemTimeZoneById(candidate), candidate == id ? null : $"unknown time zone {id}");
            }
            catch (Exception e) when (e is TimeZoneNotFoundException or InvalidTimeZoneException or ArgumentException)
            {
                // следващият кандидат
            }
        }
        return (TimeZoneInfo.Utc, $"unknown time zone {id} and no Europe/Sofia — using UTC");
    }
}
