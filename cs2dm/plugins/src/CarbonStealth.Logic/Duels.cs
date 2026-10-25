namespace CarbonStealth.Logic;

/// <summary>Правилата на дуела във FFA (CONTRACT.md §15).</summary>
public static class DuelRules
{
    /// <summary>Първият до толкова убийства един срещу друг печели.</summary>
    public const int Target = 5;
    public const int DurationSeconds = 180;
    public const int InviteSeconds = 30;
    /// <summary>Пауза за двойката след дуел или неприета покана.</summary>
    public const int CooldownSeconds = 120;
}

public enum DuelInviteError
{
    None,
    Self,
    Busy,
    TargetBusy,
    Pending,
    TargetPending,
    Cooldown,
}

public enum DuelEnd
{
    Target,
    Timeout,
    Disconnect,
    MapEnd,
}

public enum DuelOutcome
{
    Win,
    Draw,
    Cancelled,
}

/// <summary>Покана: от кого, до кого, кога (часовникът е UTC — времето на играта се нулира с картата).</summary>
public sealed record DuelInvite(string From, string FromName, string To, string ToName, DateTimeOffset At);

/// <summary>Текущ дуел. A е поканилият. Резултатът се мени само от <see cref="DuelBook"/>.</summary>
public sealed class Duel(string a, string aName, string b, string bName, DateTimeOffset startedAt)
{
    public string A { get; } = a;
    public string AName { get; } = aName;
    public string B { get; } = b;
    public string BName { get; } = bName;
    public DateTimeOffset StartedAt { get; } = startedAt;
    public int ScoreA { get; internal set; }
    public int ScoreB { get; internal set; }

    public bool Has(string id) => id == A || id == B;
    public string Opponent(string id) => id == A ? B : A;
    public int ScoreOf(string id) => id == A ? ScoreA : ScoreB;
    public string NameOf(string id) => id == A ? AName : BName;
}

/// <summary>
/// Краят на дуел. При равенство и отмяна „победителят“ е поканилият (редът е без значение — `draw`).
/// Отменен = нито едно убийство и край без време (излизане, смяна на картата) — не се записва.
/// </summary>
public sealed record DuelResult(DuelOutcome Outcome, DuelEnd Reason, string WinnerId, string WinnerName, string LoserId,
    string LoserName, int WinnerScore, int LoserScore, DateTimeOffset StartedAt, DateTimeOffset EndedAt);

/// <summary>
/// Дуелите в FFA: покана (30 s), приемане, до 5 убийства един срещу друг или 3 минути (води → печели,
/// равно → равенство), по един дуел на човек, пауза 2 минути за двойката. Излизане → другият печели, ако
/// има поне едно убийство (иначе отмяна); смяна на картата → като изтекло време, 0:0 → отмяна.
/// Само от игровата нишка.
/// </summary>
public sealed class DuelBook
{
    private readonly Dictionary<string, DuelInvite> _invites = new(StringComparer.Ordinal);
    private readonly List<Duel> _duels = [];
    private readonly Dictionary<string, DateTimeOffset> _cooldowns = new(StringComparer.Ordinal);

    public IReadOnlyList<Duel> Active => _duels;

    public Duel? DuelOf(string id) => _duels.FirstOrDefault(d => d.Has(id));

    public DuelInvite? InviteFor(string to) => _invites.GetValueOrDefault(to);

    private static string Pair(string x, string y) => string.CompareOrdinal(x, y) < 0 ? $"{x}:{y}" : $"{y}:{x}";

    /// <summary>Секунди до края на паузата на двойката (0 = може).</summary>
    public int CooldownLeft(string x, string y, DateTimeOffset now) =>
        _cooldowns.TryGetValue(Pair(x, y), out var at)
            ? Math.Max(0, (int)Math.Ceiling(DuelRules.CooldownSeconds - (now - at).TotalSeconds))
            : 0;

    public DuelInviteError Invite(string from, string fromName, string to, string toName, DateTimeOffset now)
    {
        if (from == to) return DuelInviteError.Self;
        if (DuelOf(from) is not null) return DuelInviteError.Busy;
        if (DuelOf(to) is not null) return DuelInviteError.TargetBusy;
        if (_invites.Values.Any(i => i.From == from)) return DuelInviteError.Pending;
        if (_invites.ContainsKey(to)) return DuelInviteError.TargetPending;
        if (CooldownLeft(from, to, now) > 0) return DuelInviteError.Cooldown;
        _invites[to] = new DuelInvite(from, fromName, to, toName, now);
        return DuelInviteError.None;
    }

    /// <summary>Приемане: дуелът започва, всички други покани на двамата отпадат. null = няма валидна покана.</summary>
    public Duel? Accept(string to, DateTimeOffset now)
    {
        if (!_invites.TryGetValue(to, out var invite)) return null;
        _invites.Remove(to);
        if ((now - invite.At).TotalSeconds > DuelRules.InviteSeconds || DuelOf(invite.From) is not null
            || DuelOf(to) is not null)
        {
            return null;
        }
        foreach (var key in _invites.Where(kv => kv.Value.From == to || kv.Value.From == invite.From || kv.Key == invite.From)
                     .Select(kv => kv.Key).ToList())
        {
            _invites.Remove(key);
        }
        var duel = new Duel(invite.From, invite.FromName, to, invite.ToName, now);
        _duels.Add(duel);
        return duel;
    }

    public DuelInvite? Decline(string to, DateTimeOffset now)
    {
        if (!_invites.Remove(to, out var invite)) return null;
        _cooldowns[Pair(invite.From, to)] = now;
        return invite;
    }

    /// <summary>Изтеклите покани (за известие до поканилия); двойката влиза в пауза.</summary>
    public List<DuelInvite> ExpireInvites(DateTimeOffset now)
    {
        var expired = _invites.Values.Where(i => (now - i.At).TotalSeconds > DuelRules.InviteSeconds).ToList();
        foreach (var invite in expired)
        {
            _invites.Remove(invite.To);
            _cooldowns[Pair(invite.From, invite.To)] = now;
        }
        return expired;
    }

    /// <summary>Убийство между хора: брои се само между двамата в един дуел. Резултат при 5.</summary>
    public (Duel? Duel, DuelResult? Result) Kill(string attacker, string victim, DateTimeOffset now)
    {
        if (DuelOf(attacker) is not { } duel || duel.Opponent(attacker) != victim) return (null, null);
        if (attacker == duel.A) duel.ScoreA++;
        else duel.ScoreB++;
        return duel.ScoreOf(attacker) >= DuelRules.Target ? (duel, Finish(duel, DuelEnd.Target, now)) : (duel, null);
    }

    /// <summary>Изтеклите дуели (3 минути): води → печели, равно → равенство.</summary>
    public List<DuelResult> Tick(DateTimeOffset now) =>
        _duels.Where(d => (now - d.StartedAt).TotalSeconds >= DuelRules.DurationSeconds).ToList()
            .Select(d => Finish(d, DuelEnd.Timeout, now)).ToList();

    /// <summary>Кой е още на сървъра: дуел с излязъл играч свършва, поканите му отпадат.</summary>
    public List<DuelResult> SyncPresence(IReadOnlySet<string> online, DateTimeOffset now)
    {
        foreach (var key in _invites.Where(kv => !online.Contains(kv.Key) || !online.Contains(kv.Value.From))
                     .Select(kv => kv.Key).ToList())
        {
            _invites.Remove(key);
        }
        return _duels.Where(d => !online.Contains(d.A) || !online.Contains(d.B)).ToList()
            .Select(d => Finish(d, DuelEnd.Disconnect, now, gone: online.Contains(d.A) ? d.B : d.A)).ToList();
    }

    /// <summary>Смяна на картата: всички дуели свършват (0:0 → отмяна), поканите и паузите се изчистват.</summary>
    public List<DuelResult> EndAll(DateTimeOffset now)
    {
        var results = _duels.ToList().Select(d => Finish(d, DuelEnd.MapEnd, now)).ToList();
        _invites.Clear();
        _cooldowns.Clear();
        return results;
    }

    private DuelResult Finish(Duel d, DuelEnd reason, DateTimeOffset now, string? gone = null)
    {
        _duels.Remove(d);
        _cooldowns[Pair(d.A, d.B)] = now;
        var noKills = d.ScoreA + d.ScoreB == 0;
        string winner;
        DuelOutcome outcome;
        if (noKills && reason is DuelEnd.Disconnect or DuelEnd.MapEnd)
        {
            (outcome, winner) = (DuelOutcome.Cancelled, d.A);
        }
        else if (gone is not null)
        {
            (outcome, winner) = (DuelOutcome.Win, d.Opponent(gone));
        }
        else if (d.ScoreA == d.ScoreB)
        {
            (outcome, winner) = (DuelOutcome.Draw, d.A);
        }
        else
        {
            (outcome, winner) = (DuelOutcome.Win, d.ScoreA > d.ScoreB ? d.A : d.B);
        }
        var loser = d.Opponent(winner);
        return new DuelResult(outcome, reason, winner, d.NameOf(winner), loser, d.NameOf(loser), d.ScoreOf(winner),
            d.ScoreOf(loser), d.StartedAt, now);
    }
}
