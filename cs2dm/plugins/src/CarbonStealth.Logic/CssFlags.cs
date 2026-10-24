namespace CarbonStealth.Logic;

/// <summary>
/// Роля → права на CounterStrikeSharp, за да познават екипа ни чуждите плъгини (CheaterTroll и други).
/// Никога <c>@css/vip</c> — DM плъгинът дава с него VIP предимства, а у нас VIP е обикновен играч — и
/// никога <c>@css/root</c> (само собственикът, от admins.json). CONTRACT.md §1.
/// </summary>
public static class CssFlagMap
{
    /// <summary>Права, които мостът не дава при никаква роля.</summary>
    public static readonly IReadOnlySet<string> Forbidden = new HashSet<string>(StringComparer.Ordinal) { "@css/vip", "@css/root" };

    private static readonly (Role Min, string Flag)[] Grants =
    [
        (Role.Helper, "@css/generic"),
        (Role.Moderator, "@css/chat"),
        (Role.Moderator, "@css/kick"),
        (Role.Admin, "@css/ban"),
        (Role.Admin, "@css/slay"),
        (Role.HeadAdmin, "@cheatertroll/admin"),
    ];

    /// <summary>Всички права, които мостът може да даде.</summary>
    public static IReadOnlyList<string> All { get; } = [.. Grants.Select(g => g.Flag)];

    public static IReadOnlySet<string> For(Role role) =>
        Grants.Where(g => role >= g.Min).Select(g => g.Flag).ToHashSet(StringComparer.Ordinal);
}

/// <summary>Какво да се направи в AdminManager на CSS: права за добавяне/махане и дали да се махне записът.</summary>
public sealed record CssFlagPlan(IReadOnlyList<string> Add, IReadOnlyList<string> Remove, bool DropEntry)
{
    public static readonly CssFlagPlan None = new([], [], false);

    public bool IsEmpty => Add.Count == 0 && Remove.Count == 0 && !DropEntry;
}

/// <summary>
/// Помни кои права сме дали ние (по SteamID64), за да махаме само тях: правата от admins.json и от други
/// плъгини не се пипат. Записът в AdminManager се маха само ако ние сме го създали и вече е празен.
/// Не е нишково безопасен — вика се само от игровата нишка.
/// </summary>
public sealed class CssFlagLedger
{
    private static readonly IReadOnlySet<string> NoFlags = new HashSet<string>();

    private sealed class Entry(bool created)
    {
        public HashSet<string> Ours { get; } = new(StringComparer.Ordinal);
        public bool Created { get; } = created;
    }

    private readonly Dictionary<ulong, Entry> _entries = new();

    /// <summary>Играчите, на които сме дали поне едно право.</summary>
    public IReadOnlyCollection<ulong> Tracked => _entries.Keys;

    /// <summary>Правата, които сме дали на играча (за тестове и лог).</summary>
    public IReadOnlySet<string> GrantedTo(ulong steamId) =>
        _entries.TryGetValue(steamId, out var e) ? e.Ours : NoFlags;

    /// <param name="existing">Правата на играча в CSS в момента (с нашите); null = няма запис в AdminManager.</param>
    public CssFlagPlan Sync(ulong steamId, Role role, IReadOnlySet<string>? existing)
    {
        var desired = CssFlagMap.For(role);
        var have = existing ?? NoFlags;
        _entries.TryGetValue(steamId, out var entry);
        var add = desired.Where(f => !have.Contains(f)).Order(StringComparer.Ordinal).ToList();
        List<string> remove = entry is null ? [] : [.. entry.Ours.Where(f => !desired.Contains(f)).Order(StringComparer.Ordinal)];
        if (entry is null)
        {
            if (add.Count == 0) return CssFlagPlan.None;
            entry = new Entry(created: existing is null);
            _entries[steamId] = entry;
        }
        entry.Ours.ExceptWith(remove);
        entry.Ours.UnionWith(add);
        if (entry.Ours.Count > 0) return new CssFlagPlan(add, remove, false);

        _entries.Remove(steamId);
        return new CssFlagPlan(add, remove, entry.Created && have.All(remove.Contains));
    }

    /// <summary>Излизане или спиране на плъгина: махаме всичко наше.</summary>
    public CssFlagPlan Forget(ulong steamId, IReadOnlySet<string>? existing)
    {
        if (!_entries.Remove(steamId, out var entry)) return CssFlagPlan.None;
        var remove = entry.Ours.Order(StringComparer.Ordinal).ToList();
        var othersLeft = (existing ?? NoFlags).Any(f => !entry.Ours.Contains(f));
        return new CssFlagPlan([], remove, entry.Created && !othersLeft);
    }
}
