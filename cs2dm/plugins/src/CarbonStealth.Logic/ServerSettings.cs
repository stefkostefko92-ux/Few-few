using System.Globalization;
using System.Text.Json;

namespace CarbonStealth.Logic;

/// <summary>Рекламите в чата: интервал (0 = изключени), включените вградени и собствените текстове.</summary>
public sealed record AdvertSettings(int IntervalSec, IReadOnlyList<string> Builtin, IReadOnlyList<string> CustomBg, IReadOnlyList<string> CustomEn);

/// <summary>
/// Живите настройки (CONTRACT.md §11) — редовете на server_settings, проверени наново тук: панелът ги
/// пише по строга схема, но базата е граница. Невалидна група → стойността от конфига на плъгина
/// (fail-safe); <c>BotQuota = null</c> → не пипаме bot_quota (важи cfg-то на картата).
/// </summary>
public sealed record ServerSettings(AdvertSettings Adverts, bool InfiniteAmmo, int? BotQuota, int XpTenths, bool Welcome)
{
    /// <summary>Вградените реклами — ключовете <c>advert.&lt;ключ&gt;</c> в lang/*.json, в реда на въртене.</summary>
    public static readonly IReadOnlyList<string> BuiltinAdverts = ["carbonstealth", "adblock", "site"];
    public const int MaxCustomAdverts = 5;
    public const int AdvertTextMax = 192;
    public const int BotQuotaMax = 16;

    /// <summary>Конфигът на плъгина (cs2.env) като настройки — каквото важи без ред в базата.</summary>
    public static ServerSettings FromConfig(int advertSeconds, bool infiniteAmmo) =>
        new(new AdvertSettings(ValidInterval(advertSeconds) ? advertSeconds : 240, BuiltinAdverts, [], []),
            infiniteAmmo, null, 10, true);

    public static bool ValidInterval(int seconds) => seconds == 0 || seconds is >= 60 and <= 3600;

    /// <param name="rows">ключ → JSON текстът на реда.</param>
    /// <param name="invalid">тук се добавят ключовете с повредени редове (за лога).</param>
    public static ServerSettings Parse(IReadOnlyDictionary<string, string> rows, ServerSettings fallback, ICollection<string>? invalid = null)
    {
        var result = fallback;
        foreach (var (key, json) in rows)
        {
            try
            {
                using var doc = JsonDocument.Parse(json);
                var root = doc.RootElement;
                if (root.ValueKind != JsonValueKind.Object) throw new FormatException("not an object");
                result = key switch
                {
                    "adverts" => result with { Adverts = ParseAdverts(root) },
                    "ammo" => result with { InfiniteAmmo = Bool(root, "infiniteReserve") },
                    "bots" => result with { BotQuota = Int(root, "quota", 0, BotQuotaMax) },
                    "xp" => result with { XpTenths = Tenths(root, "multiplier") },
                    "join" => result with { Welcome = Bool(root, "welcome") },
                    _ => result,
                };
            }
            catch (Exception e) when (e is JsonException or FormatException or InvalidOperationException or KeyNotFoundException)
            {
                invalid?.Add(key);
            }
        }
        return result;
    }

    private static AdvertSettings ParseAdverts(JsonElement root)
    {
        var interval = Int(root, "intervalSec", 0, 3600);
        if (!ValidInterval(interval)) throw new FormatException("interval");
        var builtin = root.GetProperty("builtin");
        var on = BuiltinAdverts.Where(k => Bool(builtin, k)).ToList();
        var custom = root.GetProperty("custom");
        return new AdvertSettings(interval, on, Texts(custom, "bg"), Texts(custom, "en"));
    }

    private static List<string> Texts(JsonElement parent, string name)
    {
        var list = parent.GetProperty(name);
        if (list.ValueKind != JsonValueKind.Array || list.GetArrayLength() > MaxCustomAdverts) throw new FormatException(name);
        return list.EnumerateArray()
            .Select(e => Text.SafeText(e.GetString(), AdvertTextMax))
            .Where(t => t.Length > 0)
            .ToList();
    }

    private static bool Bool(JsonElement parent, string name) => parent.GetProperty(name).ValueKind switch
    {
        JsonValueKind.True => true,
        JsonValueKind.False => false,
        _ => throw new FormatException(name),
    };

    private static int Int(JsonElement parent, string name, int min, int max)
    {
        var value = parent.GetProperty(name);
        if (value.ValueKind != JsonValueKind.Number || !value.TryGetInt32(out var n) || n < min || n > max) throw new FormatException(name);
        return n;
    }

    /// <summary>Множител 1,0…3,0 със стъпка 0,1 → десети (10…30), както в панела (settings.ts).</summary>
    private static int Tenths(JsonElement parent, string name)
    {
        var value = parent.GetProperty(name);
        if (value.ValueKind != JsonValueKind.Number || !value.TryGetDecimal(out var m)) throw new FormatException(name);
        var tenths = m * 10m;
        if (tenths != decimal.Truncate(tenths) || tenths < 10m || tenths > 30m) throw new FormatException(name);
        return (int)tenths;
    }

    /// <summary>Множителят за показ: 15 → „1.5“.</summary>
    public static string FormatTenths(int tenths) =>
        (tenths / 10m).ToString("0.#", CultureInfo.InvariantCulture);
}

/// <summary>
/// Ротацията на рекламите: вградените (<c>advert.&lt;ключ&gt;</c>) и после собствените текстове
/// (<c>custom:&lt;n&gt;</c>). Собственият текст се показва на езика на играча (bg или en); липсва ли
/// на неговия език — на другия.
/// </summary>
public static class AdvertPlan
{
    private const string CustomPrefix = "custom:";

    public static IReadOnlyList<string> Slots(AdvertSettings a)
    {
        var slots = a.Builtin.Select(k => $"advert.{k}").ToList();
        var custom = Math.Max(a.CustomBg.Count, a.CustomEn.Count);
        for (var i = 0; i < custom; i++) slots.Add(CustomPrefix + i.ToString(CultureInfo.InvariantCulture));
        return slots;
    }

    public static bool TryCustomIndex(string slot, out int index)
    {
        index = -1;
        return slot.StartsWith(CustomPrefix, StringComparison.Ordinal)
            && int.TryParse(slot.AsSpan(CustomPrefix.Length), NumberStyles.None, CultureInfo.InvariantCulture, out index);
    }

    public static string? CustomText(AdvertSettings a, int index, bool bulgarian)
    {
        var (first, second) = bulgarian ? (a.CustomBg, a.CustomEn) : (a.CustomEn, a.CustomBg);
        if (index >= 0 && index < first.Count) return first[index];
        if (index >= 0 && index < second.Count) return second[index];
        return null;
    }
}
