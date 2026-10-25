namespace CarbonStealth.Logic;

/// <summary>Натрупаните промени за един играч до следващото записване — с епохата, с която са събрани.</summary>
public sealed class PlayerDelta
{
    /// <summary>Епохата на статистиките на играча (CONTRACT.md §3) — партида със стара епоха базата я отхвърля.</summary>
    public int Epoch { get; init; }
    public string Name { get; set; } = "";
    public int Kills { get; set; }
    public int Deaths { get; set; }
    public int Headshots { get; set; }
    public int Assists { get; set; }
    public int Damage { get; set; }
    public int ShotsFired { get; set; }
    public int ShotsHit { get; set; }
    public int BestStreak { get; set; }
    public int BountiesClaimed { get; set; }
    public int Revenges { get; set; }
    public long Xp { get; set; }
    public int PlaytimeSec { get; set; }

    public void Merge(PlayerDelta o)
    {
        if (o.Name.Length > 0) Name = o.Name;
        Kills += o.Kills;
        Deaths += o.Deaths;
        Headshots += o.Headshots;
        Assists += o.Assists;
        Damage += o.Damage;
        ShotsFired += o.ShotsFired;
        ShotsHit += o.ShotsHit;
        BestStreak = Math.Max(BestStreak, o.BestStreak);
        BountiesClaimed += o.BountiesClaimed;
        Revenges += o.Revenges;
        Xp += o.Xp;
        PlaytimeSec += o.PlaytimeSec;
    }
}

public sealed record KillRow(
    DateTimeOffset At, string Mode, string? AttackerId, string VictimId, string Weapon,
    bool Headshot, bool Wallbang, bool Noscope, bool ThroughSmoke, bool AttackerBlind, float Distance,
    float Ax, float Ay, float Az, float Vx, float Vy, float Vz);

/// <summary>
/// Партида за записване. Пълни се само от игровата нишка; записва се извън нея. Епохата (§3): когато
/// панелът редактира статистиките на играч, натрупаното за него с по-стара епоха се изхвърля — тук
/// (<see cref="For"/>, <see cref="Discard"/>, <see cref="Merge"/>) и в базата (WHERE ред.stats_epoch ≤ партида).
/// </summary>
public sealed class StatsBatch
{
    /// <summary>Таван на суровите убийства в паметта, ако базата не е достъпна дълго.</summary>
    public const int MaxBufferedKills = 50_000;

    public Dictionary<string, PlayerDelta> Players { get; } = new(StringComparer.Ordinal);
    public Dictionary<(string SteamId, string Weapon), (int Kills, int Headshots)> Weapons { get; } = new();
    public List<KillRow> Kills { get; } = [];

    public bool IsEmpty => Players.Count == 0 && Weapons.Count == 0 && Kills.Count == 0;

    /// <summary>Делтата на играча. Натрупаното с по-стара епоха се изхвърля (панелът е редактирал).</summary>
    public PlayerDelta For(string steamId, string name, int epoch)
    {
        if (Players.TryGetValue(steamId, out var d) && d.Epoch < epoch)
        {
            Discard(steamId);
            d = null;
        }
        if (d is null)
        {
            d = new PlayerDelta { Epoch = epoch };
            Players[steamId] = d;
        }
        if (name.Length > 0) d.Name = name;
        return d;
    }

    /// <summary>Епохата, с която е събрано натрупаното за играча (0 без делта).</summary>
    public int EpochOf(string steamId) => Players.TryGetValue(steamId, out var d) ? d.Epoch : 0;

    public void AddWeapon(string steamId, int epoch, string weapon, bool headshot)
    {
        For(steamId, "", epoch);
        var (k, h) = Weapons.GetValueOrDefault((steamId, weapon));
        Weapons[(steamId, weapon)] = (k + 1, h + (headshot ? 1 : 0));
    }

    /// <summary>Изхвърля натрупаното за играча (player.reload). Суровите убийства остават — те не са агрегати.</summary>
    public bool Discard(string steamId)
    {
        var removed = Players.Remove(steamId);
        foreach (var key in Weapons.Keys.Where(k => k.SteamId == steamId).ToList())
        {
            Weapons.Remove(key);
            removed = true;
        }
        return removed;
    }

    /// <summary>
    /// Връща неуспешно записана партида обратно (при срив на базата). Делта с по-стара епоха от
    /// тази, която вече имаме за играча, се пропуска — панелът е редактирал междувременно.
    /// </summary>
    public void Merge(StatsBatch failed)
    {
        var accepted = new HashSet<string>(StringComparer.Ordinal);
        foreach (var (id, d) in failed.Players)
        {
            if (Players.TryGetValue(id, out var mine) && mine.Epoch > d.Epoch) continue;
            For(id, d.Name, d.Epoch).Merge(d);
            accepted.Add(id);
        }
        foreach (var ((id, w), (k, h)) in failed.Weapons)
        {
            if (!accepted.Contains(id)) continue;
            var (k0, h0) = Weapons.GetValueOrDefault((id, w));
            Weapons[(id, w)] = (k0 + k, h0 + h);
        }
        var room = MaxBufferedKills - Kills.Count;
        if (room > 0) Kills.AddRange(failed.Kills.Take(room));
    }
}

/// <summary>Как се отнася епохата от базата към тази, която плъгинът знае за играча.</summary>
public enum EpochChange
{
    /// <summary>Същата — XP се взима като max(в паметта, в базата), както досега.</summary>
    Same,
    /// <summary>Панелът е редактирал: базата е меродавна, натрупаното се изхвърля.</summary>
    Newer,
    /// <summary>Четене отпреди редакцията, дошло късно — пренебрегва се (епохата никога не намалява).</summary>
    Stale,
}

public static class StatsEpochs
{
    public static EpochChange Compare(int known, int fromDb) =>
        fromDb > known ? EpochChange.Newer : fromDb == known ? EpochChange.Same : EpochChange.Stale;
}
