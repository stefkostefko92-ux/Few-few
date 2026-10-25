namespace CarbonStealth.Logic;

/// <summary>Една гореща зона: от `map_zones` (Id &gt; 0) или резервната — най-гъстият клъстер убийства (Id = 0).</summary>
public sealed record HotZoneSpot(int Id, string Name, float X, float Y, float Z, int Radius);

/// <summary>„Крал на зоната“ — най-много убийства на хора вътре (поне <see cref="HotZoneRules.KingMinKills"/>).</summary>
public sealed record ZoneKing(string SteamId, string Name, int Kills);

public enum ZonePhase
{
    None,
    Started,
    Warned,
    Ended,
}

/// <summary>Правилата на горещата зона (CONTRACT.md §15) — едно място за числата и проверките.</summary>
public static class HotZoneRules
{
    public const int DefaultEveryMinutes = 8;
    public const int MinEveryMinutes = 4;
    public const int MaxEveryMinutes = 60;
    public const int ActiveSeconds = 180;
    public const int WarnSeconds = 30;
    public const int DefaultRadius = 250;
    public const int MinRadius = 100;
    public const int MaxRadius = 800;
    /// <summary>Над/под центъра — иначе катуокът над долния тунел би бил „в зоната“.</summary>
    public const float MaxHeight = 160f;
    public const int KingMinKills = 3;
    /// <summary>Резервната зона: най-гъстата клетка (с височина) от убийствата за последните 7 дни, поне 5.</summary>
    public const int FallbackDays = 7;
    public const int FallbackMinKills = 5;
    public const int MaxNameLength = 24;
    /// <summary>Височината на „етажа“ в SQL-а на клъстера — точки от различни нива не се смесват.</summary>
    public const double HeightBand = 128;

    /// <summary>Като CHECK-а в базата: `^[A-Za-z0-9 _-]{1,24}$`, без празно само от интервали.</summary>
    public static bool IsValidName(string name) =>
        name.Length is >= 1 and <= MaxNameLength
        && name.Trim().Length > 0
        && name.All(c => char.IsAsciiLetterOrDigit(c) || c is ' ' or '_' or '-');

    /// <summary>„!zone add Long A 300“ → („Long A“, 300); без число накрая — радиусът по подразбиране.</summary>
    public static (string Name, int Radius)? ParseAdd(IReadOnlyList<string> args)
    {
        if (args.Count == 0) return null;
        var radius = DefaultRadius;
        var words = args.ToList();
        if (words.Count > 1 && int.TryParse(words[^1], System.Globalization.NumberStyles.None,
                System.Globalization.CultureInfo.InvariantCulture, out var r))
        {
            if (r is < MinRadius or > MaxRadius) return null;
            radius = r;
            words.RemoveAt(words.Count - 1);
        }
        var name = string.Join(' ', words).Trim();
        return IsValidName(name) ? (name, radius) : null;
    }

    public static bool Contains(HotZoneSpot zone, float x, float y, float z)
    {
        var (dx, dy) = (x - zone.X, y - zone.Y);
        return dx * dx + dy * dy <= (float)zone.Radius * zone.Radius && MathF.Abs(z - zone.Z) <= MaxHeight;
    }

    /// <summary>Зоните на картата се редуват; без нито една — резервната (може и да няма).</summary>
    public static HotZoneSpot? Pick(IReadOnlyList<HotZoneSpot> zones, HotZoneSpot? fallback, int round) =>
        zones.Count > 0 ? zones[(int)((uint)round % (uint)zones.Count)] : fallback;
}

/// <summary>
/// Часовникът по времето на играта (Server.CurrentTime): зона на всеки N секунди (от начало до начало),
/// активна 180 s, предупреждение 30 s преди края. Само от игровата нишка.
/// </summary>
public sealed class HotZoneClock(int everySeconds, int activeSeconds = HotZoneRules.ActiveSeconds,
    int warnSeconds = HotZoneRules.WarnSeconds)
{
    private double _nextStart = double.NaN;
    private double _endsAt;
    private double _last = double.NegativeInfinity;
    private bool _warned;

    public bool Enabled => everySeconds > 0;
    public bool Active { get; private set; }

    /// <summary>Нова карта или празен сървър: активната зона спира тихо, следващата — след цял интервал.</summary>
    public void Reset(double now)
    {
        Active = false;
        _warned = false;
        _nextStart = now + everySeconds;
        _last = now;
    }

    public ZonePhase Tick(double now)
    {
        if (!Enabled) return ZonePhase.None;
        // Първи тик или времето е тръгнало назад (нова карта без OnMapStart) → отначало.
        if (double.IsNaN(_nextStart) || now + 1 < _last)
        {
            Reset(now);
            return ZonePhase.None;
        }
        _last = now;
        if (Active)
        {
            if (now >= _endsAt)
            {
                Active = false;
                return ZonePhase.Ended;
            }
            if (_warned || now < _endsAt - warnSeconds) return ZonePhase.None;
            _warned = true;
            return ZonePhase.Warned;
        }
        if (now < _nextStart) return ZonePhase.None;
        Active = true;
        _warned = false;
        _endsAt = now + activeSeconds;
        _nextStart = now + everySeconds;
        return ZonePhase.Started;
    }

    public int SecondsLeft(double now) => Active ? (int)Math.Ceiling(Math.Max(0, _endsAt - now)) : 0;
}

/// <summary>Убийствата на хора вътре в една зона — за „Крал на зоната“. Само от игровата нишка.</summary>
public sealed class HotZoneRound
{
    private readonly Dictionary<string, (string Name, int Kills, long Reached)> _kills = new(StringComparer.Ordinal);
    private long _seq;

    public void Kill(string steamId, string name)
    {
        var kills = _kills.TryGetValue(steamId, out var line) ? line.Kills : 0;
        _kills[steamId] = (name, kills + 1, ++_seq);
    }

    public int KillsOf(string steamId) => _kills.TryGetValue(steamId, out var line) ? line.Kills : 0;

    /// <summary>Най-много убийства (поне 3); при равенство — който е стигнал броя пръв.</summary>
    public ZoneKing? King() => _kills
        .Where(kv => kv.Value.Kills >= HotZoneRules.KingMinKills)
        .OrderByDescending(kv => kv.Value.Kills)
        .ThenBy(kv => kv.Value.Reached)
        .Select(kv => new ZoneKing(kv.Key, kv.Value.Name, kv.Value.Kills))
        .FirstOrDefault();

    public void Clear()
    {
        _kills.Clear();
        _seq = 0;
    }
}
