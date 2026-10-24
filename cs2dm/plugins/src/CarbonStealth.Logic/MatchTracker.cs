namespace CarbonStealth.Logic;

/// <summary>Ред на играч в картата на мача (CONTRACT.md §13).</summary>
public sealed record MatchPlayerResult(
    string SteamId, string Name, int Place, int Kills, int Deaths, int Headshots, int BestStreak,
    int BountiesClaimed, int Xp, string? TopWeapon, int TopWeaponKills);

/// <summary>Мачът при края: време, общо убийства и играчите по място.</summary>
public sealed record MatchSummary(DateTimeOffset StartedAt, DateTimeOffset EndedAt, int Kills, IReadOnlyList<MatchPlayerResult> Players);

/// <summary>
/// Статистиките на един мач (една карта до смяната ѝ) — само хора срещу хора, както в §3. Чиста
/// логика: плъгинът вика Begin при нов мач (GameStartTime), Kill/Death от player_death и Finish при края.
/// Не е нишково безопасен — само от игровата нишка.
/// </summary>
public sealed class MatchTracker
{
    /// <summary>По-кратък мач (смяна на картата от админ веднага след старта) не се записва.</summary>
    public static readonly TimeSpan MinDuration = TimeSpan.FromSeconds(60);

    private sealed class Line(string name)
    {
        public string Name { get; set; } = name;
        public int Kills;
        public int Deaths;
        public int Headshots;
        public int Streak;
        public int BestStreak;
        public int Bounties;
        public int Xp;
        public readonly Dictionary<string, int> Weapons = new(StringComparer.Ordinal);
    }

    private readonly Dictionary<string, Line> _lines = new(StringComparer.Ordinal);
    private int _kills;

    public DateTimeOffset? StartedAt { get; private set; }

    public bool Running => StartedAt is not null;

    /// <summary>Нов мач — всичко отпреди се изхвърля (рестарт на играта нулира и таблицата в играта).</summary>
    public void Begin(DateTimeOffset at)
    {
        StartedAt = at;
        _lines.Clear();
        _kills = 0;
    }

    private Line For(string steamId, string name)
    {
        if (!_lines.TryGetValue(steamId, out var line))
        {
            line = new Line(name);
            _lines[steamId] = line;
        }
        if (name.Length > 0) line.Name = name;
        return line;
    }

    public void Kill(string attacker, string attackerName, string victim, string victimName, string weapon,
        bool headshot, bool bountyClaimed, int xp)
    {
        if (!Running) return;
        _kills++;
        var a = For(attacker, attackerName);
        a.Kills++;
        if (headshot) a.Headshots++;
        if (bountyClaimed) a.Bounties++;
        a.Xp += Math.Max(0, xp);
        a.Streak++;
        a.BestStreak = Math.Max(a.BestStreak, a.Streak);
        a.Weapons[weapon] = a.Weapons.GetValueOrDefault(weapon) + 1;
        var v = For(victim, victimName);
        v.Deaths++;
        v.Streak = 0;
    }

    /// <summary>Самоубийство/падане — смърт се брои (както в статистиките).</summary>
    public void Death(string victim, string name)
    {
        if (!Running) return;
        var v = For(victim, name);
        v.Deaths++;
        v.Streak = 0;
    }

    /// <summary>Убит от бот: серията изгаря, но смъртта не се брои (ботовете не влизат в статистиките).</summary>
    public void StreakBroken(string victim)
    {
        if (Running && _lines.TryGetValue(victim, out var v)) v.Streak = 0;
    }

    /// <summary>Край: картата или null (няма мач, няма убийство или е по-къс от минимума). Спира следенето.</summary>
    public MatchSummary? Finish(DateTimeOffset at)
    {
        if (StartedAt is not { } started) return null;
        StartedAt = null;
        if (_kills == 0 || at - started < MinDuration) return null;
        var ordered = _lines
            .Where(kv => kv.Value.Kills > 0 || kv.Value.Deaths > 0)
            .OrderByDescending(kv => kv.Value.Kills)
            .ThenBy(kv => kv.Value.Deaths)
            .ThenByDescending(kv => kv.Value.Headshots)
            .ThenBy(kv => kv.Key, StringComparer.Ordinal)
            .Select((kv, i) =>
            {
                var l = kv.Value;
                var top = l.Weapons.OrderByDescending(w => w.Value).ThenBy(w => w.Key, StringComparer.Ordinal).FirstOrDefault();
                return new MatchPlayerResult(kv.Key, l.Name, i + 1, l.Kills, l.Deaths, l.Headshots, l.BestStreak,
                    l.Bounties, l.Xp, top.Key, top.Value);
            })
            .ToList();
        return new MatchSummary(started, at, _kills, ordered);
    }
}
