using CarbonStealth.Logic;

namespace CarbonStealth.State;

/// <summary>Активно наказание на играч (заредено от базата).</summary>
public sealed record ActivePunishment(int Id, string Type, string Category, DateTimeOffset? ExpiresAt);

/// <summary>Състоянието на един човек на сървъра. Пипа се само от игровата нишка.</summary>
public sealed class PlayerState(ulong steamId, int slot, string name)
{
    public ulong SteamId { get; } = steamId;
    public string SteamId64 => SteamId.ToString(System.Globalization.CultureInfo.InvariantCulture);
    public int Slot { get; } = slot;
    public string Name { get; set; } = name;
    public Role Role { get; set; } = Role.Player;
    public DateTimeOffset? VipUntil { get; set; }
    public long Xp { get; set; }
    public long? SessionId { get; set; }
    public DateTimeOffset ConnectedAt { get; } = DateTimeOffset.UtcNow;
    /// <summary>До кой момент изиграното време вече е отчетено в статистиките.</summary>
    public DateTimeOffset AccruedUntil { get; set; } = DateTimeOffset.UtcNow;
    /// <summary>Последен доклад (против спам на !report).</summary>
    public DateTimeOffset LastReportAt { get; set; } = DateTimeOffset.MinValue;
    public int SessionKills { get; set; }
    public int SessionDeaths { get; set; }
    public bool Loaded { get; set; }
    public List<ActivePunishment> Punishments { get; set; } = [];

    public bool IsVip(DateTimeOffset now) => VipUntil is { } until && until > now;

    public int Level => Progression.LevelFromXp(Xp);

    public ActivePunishment? Active(string type, DateTimeOffset now) =>
        Punishments.FirstOrDefault(p => p.Type == type && (p.ExpiresAt is null || p.ExpiresAt > now));

    /// <summary>Gag (чат) или Silence (чат + глас).</summary>
    public ActivePunishment? ChatBlock(DateTimeOffset now) => Active("GAG", now) ?? Active("SILENCE", now);

    /// <summary>Mute (глас) или Silence.</summary>
    public ActivePunishment? VoiceBlock(DateTimeOffset now) => Active("MUTE", now) ?? Active("SILENCE", now);
}

/// <summary>Хората на сървъра по слот. Ботовете не влизат тук.</summary>
public sealed class PlayerRegistry
{
    private readonly Dictionary<int, PlayerState> _bySlot = new();

    public PlayerState Add(ulong steamId, int slot, string name)
    {
        var state = new PlayerState(steamId, slot, name);
        _bySlot[slot] = state;
        return state;
    }

    public PlayerState? BySlot(int slot) => _bySlot.GetValueOrDefault(slot);

    public PlayerState? BySteamId(ulong steamId) => _bySlot.Values.FirstOrDefault(p => p.SteamId == steamId);

    public PlayerState? Remove(int slot) => _bySlot.Remove(slot, out var s) ? s : null;

    public IReadOnlyCollection<PlayerState> All => _bySlot.Values;
}
