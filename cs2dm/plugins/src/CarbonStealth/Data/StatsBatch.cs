namespace CarbonStealth.Data;

/// <summary>Натрупаните промени за един играч до следващото записване.</summary>
public sealed class PlayerDelta
{
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

/// <summary>Партида за записване. Пълни се само от игровата нишка; записва се извън нея.</summary>
public sealed class StatsBatch
{
    /// <summary>Таван на суровите убийства в паметта, ако базата не е достъпна дълго.</summary>
    public const int MaxBufferedKills = 50_000;

    public Dictionary<string, PlayerDelta> Players { get; } = new(StringComparer.Ordinal);
    public Dictionary<(string SteamId, string Weapon), (int Kills, int Headshots)> Weapons { get; } = new();
    public List<KillRow> Kills { get; } = [];

    public bool IsEmpty => Players.Count == 0 && Weapons.Count == 0 && Kills.Count == 0;

    public PlayerDelta For(string steamId, string name)
    {
        if (!Players.TryGetValue(steamId, out var d))
        {
            d = new PlayerDelta();
            Players[steamId] = d;
        }
        if (name.Length > 0) d.Name = name;
        return d;
    }

    public void AddWeapon(string steamId, string weapon, bool headshot)
    {
        var (k, h) = Weapons.GetValueOrDefault((steamId, weapon));
        Weapons[(steamId, weapon)] = (k + 1, h + (headshot ? 1 : 0));
    }

    /// <summary>Връща неуспешно записана партида обратно (при срив на базата).</summary>
    public void Merge(StatsBatch failed)
    {
        foreach (var (id, d) in failed.Players)
        {
            For(id, d.Name).Merge(d);
        }
        foreach (var ((id, w), (k, h)) in failed.Weapons)
        {
            var (k0, h0) = Weapons.GetValueOrDefault((id, w));
            Weapons[(id, w)] = (k0 + k, h0 + h);
        }
        var room = MaxBufferedKills - Kills.Count;
        if (room > 0) Kills.AddRange(failed.Kills.Take(room));
    }
}
