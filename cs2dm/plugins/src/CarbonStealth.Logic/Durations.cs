using System.Globalization;

namespace CarbonStealth.Logic;

public static class Durations
{
    /// <summary>
    /// „30m“, „2h“, „7d“, „1w“, „45“ (минути) → продължителност; „0“, „perm“, „permanent“ → завинаги (null).
    /// Невалиден вход → false. Таван 10 години, за да не прелее DateTime.
    /// </summary>
    public static bool TryParse(string input, out TimeSpan? duration)
    {
        duration = null;
        var s = input.Trim().ToLowerInvariant();
        if (s is "0" or "perm" or "permanent") return true;
        if (s.Length == 0) return false;

        var unit = char.IsLetter(s[^1]) ? s[^1] : 'm';
        var number = char.IsLetter(s[^1]) ? s[..^1] : s;
        if (!int.TryParse(number, NumberStyles.None, CultureInfo.InvariantCulture, out var n) || n <= 0) return false;

        TimeSpan value;
        switch (unit)
        {
            case 'm': value = TimeSpan.FromMinutes(n); break;
            case 'h': value = TimeSpan.FromHours(n); break;
            case 'd': value = TimeSpan.FromDays(n); break;
            case 'w': value = TimeSpan.FromDays(7.0 * n); break;
            default: return false;
        }
        if (value > TimeSpan.FromDays(3650)) return false;
        duration = value;
        return true;
    }

    /// <summary>Кратко човешко представяне за съобщенията в играта.</summary>
    public static string Describe(TimeSpan? duration)
    {
        if (duration is not { } d) return "permanent";
        if (d.TotalDays >= 1 && d.TotalDays % 1 == 0) return $"{(int)d.TotalDays}d";
        if (d.TotalHours >= 1 && d.TotalHours % 1 == 0) return $"{(int)d.TotalHours}h";
        return $"{(int)Math.Ceiling(d.TotalMinutes)}m";
    }
}

public static class Punishments
{
    /// <summary>Активно наказание по правилото на CONTRACT.md §2.</summary>
    public static bool IsActive(DateTimeOffset? expiresAt, DateTimeOffset? revokedAt, DateTimeOffset now) =>
        revokedAt is null && (expiresAt is null || expiresAt > now);
}
