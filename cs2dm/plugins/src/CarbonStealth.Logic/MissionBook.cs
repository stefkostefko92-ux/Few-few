namespace CarbonStealth.Logic;

/// <summary>Убийство на човек от човек — фактите, нужни на мисиите. Ботовете никога не стигат дотук.</summary>
public readonly record struct MissionKill(
    string Weapon,
    bool Headshot,
    bool Knife,
    bool Wallbang,
    bool ThroughSmoke,
    bool Noscope,
    int Streak,
    bool InZone,
    bool VictimWanted);

/// <summary>Запазеното в базата за деня (`mission_progress`).</summary>
public readonly record struct SavedMission(string Key, int Progress, DateTimeOffset? CompletedAt);

public sealed class MissionSlot(MissionDef def)
{
    public MissionDef Def { get; } = def;
    public int Progress { get; internal set; }
    public DateTimeOffset? CompletedAt { get; internal set; }
    public bool Done => CompletedAt is not null;
}

/// <summary>Какво смени едно събитие: редовете за запис и новоизпълнените мисии (за наградата и обявата).</summary>
public sealed record MissionUpdate(IReadOnlyList<MissionSlot> Changed, IReadOnlyList<MissionSlot> Completed)
{
    public static readonly MissionUpdate None = new([], []);
}

/// <summary>
/// Мисиите на един играч за един ден (CONTRACT.md §16). Напредъкът е до целта; изпълнена мисия не се връща
/// назад. Серията е най-дългата за деня (max), минутите — от изиграните секунди. Само от игровата нишка.
/// </summary>
public sealed class MissionBook
{
    private int _playSeconds;

    public MissionBook(string steamId64, DateOnly day, IEnumerable<SavedMission> saved)
        : this(day, MissionPool.Assign(steamId64, day), saved)
    {
    }

    /// <summary>С изрични мисии — за тестовете; плъгинът ползва горния (изборът за деня).</summary>
    public MissionBook(DateOnly day, IEnumerable<MissionDef> defs, IEnumerable<SavedMission> saved)
    {
        Day = day;
        var byKey = new Dictionary<string, SavedMission>(StringComparer.Ordinal);
        foreach (var row in saved) byKey.TryAdd(row.Key, row);
        Slots = defs.Select(def =>
        {
            var slot = new MissionSlot(def);
            if (byKey.TryGetValue(def.Key, out var row))
            {
                slot.Progress = Math.Clamp(row.Progress, 0, def.Target);
                slot.CompletedAt = row.CompletedAt;
            }
            return slot;
        }).ToList();
        if (Slots.FirstOrDefault(s => s.Def.Kind == MissionKind.Minutes) is { } minutes) _playSeconds = minutes.Progress * 60;
    }

    public DateOnly Day { get; }
    public IReadOnlyList<MissionSlot> Slots { get; }
    public bool AllDone => Slots.All(s => s.Done);
    public int DoneCount => Slots.Count(s => s.Done);

    public MissionUpdate RecordKill(MissionKill k, DateTimeOffset now)
    {
        var weaponClass = Progression.WeaponClass(k.Weapon);
        return Advance(now, slot => slot.Def.Kind switch
        {
            MissionKind.Headshots when k.Headshot => slot.Progress + 1,
            MissionKind.Rifle when weaponClass == "rifle" => slot.Progress + 1,
            MissionKind.Smg when weaponClass == "smg" => slot.Progress + 1,
            MissionKind.Pistol when weaponClass == "pistol" => slot.Progress + 1,
            MissionKind.Sniper when weaponClass == "sniper" => slot.Progress + 1,
            MissionKind.Knife when k.Knife => slot.Progress + 1,
            MissionKind.Wallbang when k.Wallbang => slot.Progress + 1,
            MissionKind.Smoke when k.ThroughSmoke => slot.Progress + 1,
            MissionKind.Noscope when k.Noscope => slot.Progress + 1,
            MissionKind.Streak => Math.Max(slot.Progress, k.Streak),
            MissionKind.Zone when k.InZone => slot.Progress + 1,
            MissionKind.Wanted when k.VictimWanted => slot.Progress + 1,
            _ => slot.Progress,
        });
    }

    public MissionUpdate RecordDuelWin(DateTimeOffset now) =>
        Advance(now, slot => slot.Def.Kind == MissionKind.Duel ? slot.Progress + 1 : slot.Progress);

    public MissionUpdate RecordPlaySeconds(int seconds, DateTimeOffset now)
    {
        if (seconds <= 0) return MissionUpdate.None;
        _playSeconds += seconds;
        var minutes = _playSeconds / 60;
        return Advance(now, slot => slot.Def.Kind == MissionKind.Minutes ? minutes : slot.Progress);
    }

    private MissionUpdate Advance(DateTimeOffset now, Func<MissionSlot, int> next)
    {
        List<MissionSlot>? changed = null;
        List<MissionSlot>? completed = null;
        foreach (var slot in Slots)
        {
            if (slot.Done) continue;
            var value = Math.Clamp(next(slot), slot.Progress, slot.Def.Target);
            // Пълен, но незаписан като изпълнен (стар ред) → довършва се при първото събитие.
            if (value == slot.Progress && value < slot.Def.Target) continue;
            slot.Progress = value;
            (changed ??= []).Add(slot);
            if (value < slot.Def.Target) continue;
            slot.CompletedAt = now;
            (completed ??= []).Add(slot);
        }
        return changed is null ? MissionUpdate.None : new MissionUpdate(changed, completed ?? []);
    }
}

/// <summary>Ред за `mission_progress` — абсолютни стойности, не делта: повторен запис е безвреден.</summary>
public sealed record MissionRow(string SteamId, DateOnly Day, string Key, int Target, int Progress, DateTimeOffset? CompletedAt)
{
    public static MissionRow Of(string steamId64, DateOnly day, MissionSlot slot) =>
        new(steamId64, day, slot.Def.Key, slot.Def.Target, slot.Progress, slot.CompletedAt);
}

/// <summary>
/// Партидата на мисиите (пълни се от игровата нишка, записва се извън нея заедно с таймера на статистиките).
/// Напредъкът е абсолютен → сливането взема по-голямото и по-ранното изпълнение; базата прави същото
/// (GREATEST/COALESCE), затова забавена или повторена партида не връща нищо назад.
/// </summary>
public sealed class MissionBatch
{
    public Dictionary<(string SteamId, DateOnly Day, string Key), MissionRow> Rows { get; } = new();

    /// <summary>Играч + ден с трите изпълнени: след записа базата брои серията за значката (§16).</summary>
    public HashSet<(string SteamId, DateOnly Day)> StreakChecks { get; } = new();

    public bool IsEmpty => Rows.Count == 0 && StreakChecks.Count == 0;

    public void Put(MissionRow row)
    {
        var key = (row.SteamId, row.Day, row.Key);
        if (Rows.TryGetValue(key, out var old))
        {
            row = row with
            {
                Progress = Math.Max(old.Progress, row.Progress),
                CompletedAt = old.CompletedAt is { } a && row.CompletedAt is { } b ? (a < b ? a : b) : old.CompletedAt ?? row.CompletedAt,
            };
        }
        Rows[key] = row;
    }

    public void Merge(MissionBatch failed)
    {
        foreach (var row in failed.Rows.Values) Put(row);
        StreakChecks.UnionWith(failed.StreakChecks);
    }
}
