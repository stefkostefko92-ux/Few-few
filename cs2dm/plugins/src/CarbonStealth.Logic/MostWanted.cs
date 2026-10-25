namespace CarbonStealth.Logic;

/// <summary>
/// „Most Wanted“ (CONTRACT.md §15): човекът с най-много убийства на хора на текущата карта, поне
/// <see cref="MinKills"/>. Титлата се взема само със строго повече убийства (равенство я пази); без носител
/// сред равните — който е стигнал броя пръв. Излязъл играч не е Most Wanted, но броят му остава до края на
/// картата (връща се с първото си убийство). Отделно от баунтито за серия. Само от игровата нишка.
/// </summary>
public sealed class MostWantedBoard
{
    public const int MinKills = 10;

    private sealed class Line(string name)
    {
        public string Name = name;
        public int Kills;
        public long Reached;
        public bool Present = true;
    }

    private readonly Dictionary<string, Line> _lines = new(StringComparer.Ordinal);
    private long _seq;

    public string? Current { get; private set; }

    public string? CurrentName => Current is { } id ? _lines[id].Name : null;

    public int KillsOf(string steamId) => _lines.TryGetValue(steamId, out var line) ? line.Kills : 0;

    /// <summary>Нова карта: всичко отначало.</summary>
    public void Reset()
    {
        _lines.Clear();
        _seq = 0;
        Current = null;
    }

    /// <summary>Убийство на човек. true = Most Wanted се смени (обява).</summary>
    public bool Kill(string steamId, string name)
    {
        if (!_lines.TryGetValue(steamId, out var line))
        {
            line = new Line(name);
            _lines[steamId] = line;
        }
        if (name.Length > 0) line.Name = name;
        line.Kills++;
        line.Reached = ++_seq;
        line.Present = true;
        return Recompute();
    }

    /// <summary>Кой е още на сървъра (след излизане). true = Most Wanted се смени.</summary>
    public bool SyncPresence(IReadOnlySet<string> online)
    {
        foreach (var (id, line) in _lines) line.Present = online.Contains(id);
        return Recompute();
    }

    private bool Recompute()
    {
        string? best = Current is { } c && _lines[c] is { Present: true, Kills: >= MinKills } ? c : null;
        foreach (var (id, line) in _lines)
        {
            if (!line.Present || line.Kills < MinKills || id == best) continue;
            if (best is null) { best = id; continue; }
            var held = _lines[best];
            var beats = line.Kills > held.Kills || (line.Kills == held.Kills && best != Current && line.Reached < held.Reached);
            if (beats) best = id;
        }
        if (best == Current) return false;
        Current = best;
        return true;
    }
}
