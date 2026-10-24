namespace CarbonStealth.Logic;

/// <summary>Резултат от едно убийство за серии, баунти и немезис.</summary>
public readonly record struct StreakOutcome(
    int AttackerStreak,
    int BountyClaimed,
    int NewBountyOnAttacker,
    bool BountyRaised,
    bool Revenge);

/// <summary>
/// Серии, баунти и немезис в рамките на сесията (CONTRACT.md §3). Ключ = SteamID64.
/// Не е нишково безопасен — вика се само от игровата нишка.
/// </summary>
public sealed class StreakTracker
{
    public const int BountyStartStreak = 5;
    public const int BountyStep = 25;
    public const int BountyCap = 250;
    public const int NemesisThreshold = 3;

    private readonly Dictionary<ulong, int> _streak = new();
    private readonly Dictionary<ulong, int> _bounty = new();
    // (убиец, жертва) → колко пъти подред убиецът е убил жертвата
    private readonly Dictionary<(ulong Killer, ulong Victim), int> _row = new();

    public static int BountyFor(int streak) =>
        streak < BountyStartStreak ? 0 : Math.Min(BountyStep * (streak - BountyStartStreak + 1), BountyCap);

    public int StreakOf(ulong player) => _streak.GetValueOrDefault(player);

    public int BountyOn(ulong player) => _bounty.GetValueOrDefault(player);

    /// <summary>Отчита убийство (без самоубийства — виж <see cref="RecordDeath"/>).</summary>
    public StreakOutcome RecordKill(ulong attacker, ulong victim)
    {
        var claimed = _bounty.GetValueOrDefault(victim);
        _bounty.Remove(victim);
        _streak[victim] = 0;

        var revenge = _row.GetValueOrDefault((victim, attacker)) >= NemesisThreshold;
        _row[(victim, attacker)] = 0;
        _row[(attacker, victim)] = _row.GetValueOrDefault((attacker, victim)) + 1;

        var streak = _streak.GetValueOrDefault(attacker) + 1;
        _streak[attacker] = streak;
        var oldBounty = _bounty.GetValueOrDefault(attacker);
        var newBounty = BountyFor(streak);
        if (newBounty > 0) _bounty[attacker] = newBounty;

        return new StreakOutcome(streak, claimed, newBounty, newBounty > oldBounty, revenge);
    }

    /// <summary>Смърт без убиец-играч (самоубийство, падане, бот) — серията и баунтито изгарят.</summary>
    public void RecordDeath(ulong victim)
    {
        _streak[victim] = 0;
        _bounty.Remove(victim);
    }

    public void Forget(ulong player)
    {
        _streak.Remove(player);
        _bounty.Remove(player);
        foreach (var key in _row.Keys.Where(k => k.Killer == player || k.Victim == player).ToList())
        {
            _row.Remove(key);
        }
    }
}
