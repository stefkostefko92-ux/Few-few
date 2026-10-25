using CarbonStealth.Logic;
using Xunit;

namespace CarbonStealth.Logic.Tests;

/// <summary>Дуелите (CONTRACT §15): покана 30 s, до 5 или 3 минути, един на човек, пауза 2 минути за двойката.</summary>
public class DuelTests
{
    private static readonly DateTimeOffset T0 = new(2026, 10, 25, 18, 0, 0, TimeSpan.Zero);
    private static DateTimeOffset At(double seconds) => T0.AddSeconds(seconds);

    private static (DuelBook Book, Duel Duel) Started()
    {
        var b = new DuelBook();
        Assert.Equal(DuelInviteError.None, b.Invite("a", "Alpha", "b", "Bravo", At(0)));
        var d = b.Accept("b", At(5));
        Assert.NotNull(d);
        return (b, d);
    }

    [Fact]
    public void Първият_до_5_печели_само_убийствата_между_двамата_се_броят()
    {
        var (b, d) = Started();
        Assert.Equal((null, null), b.Kill("a", "c", At(10)));
        Assert.Equal((null, null), b.Kill("c", "a", At(10)));
        for (var i = 0; i < 4; i++) Assert.Null(b.Kill("a", "b", At(11 + i)).Result);
        Assert.Null(b.Kill("b", "a", At(20)).Result);
        var (duel, result) = b.Kill("a", "b", At(21));
        Assert.Same(d, duel);
        Assert.NotNull(result);
        Assert.Equal(DuelOutcome.Win, result.Outcome);
        Assert.Equal(DuelEnd.Target, result.Reason);
        Assert.Equal(("a", "Alpha", "b", "Bravo", 5, 1), (result.WinnerId, result.WinnerName, result.LoserId,
            result.LoserName, result.WinnerScore, result.LoserScore));
        Assert.Equal((At(5), At(21)), (result.StartedAt, result.EndedAt));
        Assert.Null(b.DuelOf("a"));
    }

    [Fact]
    public void След_3_минути_води_печели_равно_е_равенство()
    {
        var (b, _) = Started();
        b.Kill("b", "a", At(30));
        Assert.Empty(b.Tick(At(184)));
        var result = Assert.Single(b.Tick(At(185)));
        Assert.Equal((DuelOutcome.Win, DuelEnd.Timeout, "b", 1, 0),
            (result.Outcome, result.Reason, result.WinnerId, result.WinnerScore, result.LoserScore));

        var b2 = new DuelBook();
        b2.Invite("a", "Alpha", "b", "Bravo", At(0));
        b2.Accept("b", At(0));
        var draw = Assert.Single(b2.Tick(At(180)));
        Assert.Equal((DuelOutcome.Draw, 0, 0), (draw.Outcome, draw.WinnerScore, draw.LoserScore));
    }

    [Fact]
    public void Поканата_изтича_след_30_s_и_двойката_чака_2_минути()
    {
        var b = new DuelBook();
        b.Invite("a", "Alpha", "b", "Bravo", At(0));
        Assert.Empty(b.ExpireInvites(At(30)));
        var expired = Assert.Single(b.ExpireInvites(At(31)));
        Assert.Equal("b", expired.To);
        Assert.Null(b.Accept("b", At(32)));
        Assert.Equal(DuelInviteError.Cooldown, b.Invite("b", "Bravo", "a", "Alpha", At(60)));
        Assert.Equal(91, b.CooldownLeft("a", "b", At(60)));
        Assert.Equal(DuelInviteError.None, b.Invite("b", "Bravo", "a", "Alpha", At(151)));
    }

    [Fact]
    public void Отказът_също_слага_пауза()
    {
        var b = new DuelBook();
        b.Invite("a", "Alpha", "b", "Bravo", At(0));
        Assert.Equal("a", b.Decline("b", At(3))?.From);
        Assert.Null(b.Decline("b", At(4)));
        Assert.Equal(DuelInviteError.Cooldown, b.Invite("a", "Alpha", "b", "Bravo", At(10)));
    }

    [Fact]
    public void Един_дуел_и_една_покана_на_човек()
    {
        var b = new DuelBook();
        Assert.Equal(DuelInviteError.Self, b.Invite("a", "Alpha", "a", "Alpha", At(0)));
        Assert.Equal(DuelInviteError.None, b.Invite("a", "Alpha", "b", "Bravo", At(0)));
        Assert.Equal(DuelInviteError.Pending, b.Invite("a", "Alpha", "c", "Charlie", At(1)));
        Assert.Equal(DuelInviteError.TargetPending, b.Invite("c", "Charlie", "b", "Bravo", At(1)));
        Assert.Equal(DuelInviteError.None, b.Invite("c", "Charlie", "a", "Alpha", At(1)));
        Assert.NotNull(b.Accept("b", At(2)));
        // Приетият дуел маха и входящата покана към поканилия.
        Assert.Null(b.InviteFor("a"));
        Assert.Equal(DuelInviteError.Busy, b.Invite("a", "Alpha", "c", "Charlie", At(3)));
        Assert.Equal(DuelInviteError.TargetBusy, b.Invite("c", "Charlie", "b", "Bravo", At(3)));
        Assert.Null(b.Accept("a", At(3)));
    }

    [Fact]
    public void Излизане_другият_печели_ако_има_убийство_иначе_отмяна()
    {
        var (b, _) = Started();
        b.Kill("b", "a", At(10));
        b.Kill("b", "a", At(11));
        b.Kill("a", "b", At(12));
        var result = Assert.Single(b.SyncPresence(new HashSet<string> { "a" }, At(13)));
        Assert.Equal((DuelOutcome.Win, DuelEnd.Disconnect, "a", 1, "b", 2),
            (result.Outcome, result.Reason, result.WinnerId, result.WinnerScore, result.LoserId, result.LoserScore));

        var (b2, _) = Started();
        var cancelled = Assert.Single(b2.SyncPresence(new HashSet<string> { "b" }, At(13)));
        Assert.Equal(DuelOutcome.Cancelled, cancelled.Outcome);
    }

    [Fact]
    public void Смяна_на_картата_води_печели_0_0_отмяна_паузите_изчезват()
    {
        var (b, _) = Started();
        b.Kill("a", "b", At(10));
        var result = Assert.Single(b.EndAll(At(20)));
        Assert.Equal((DuelOutcome.Win, DuelEnd.MapEnd, "a"), (result.Outcome, result.Reason, result.WinnerId));
        Assert.Equal(0, b.CooldownLeft("a", "b", At(21)));

        var (b2, _) = Started();
        Assert.Equal(DuelOutcome.Cancelled, Assert.Single(b2.EndAll(At(20))).Outcome);
        Assert.Empty(b2.Active);
    }

    [Fact]
    public void XP_за_дуел_е_постоянно()
    {
        Assert.Equal(50, Progression.DuelWinXp);
        var match = new MatchTracker();
        match.AddXp("a", "Alpha", 50);
        match.Begin(T0);
        match.AddXp("a", "Alpha", Progression.DuelWinXp);
        match.Kill("a", "Alpha", "b", "Bravo", "ak47", false, false, 10);
        var summary = match.Finish(T0.AddMinutes(5));
        Assert.Equal(60, summary!.Players.Single(p => p.SteamId == "a").Xp);
    }
}
