using CarbonStealth.Logic;
using Xunit;

namespace CarbonStealth.Logic.Tests;

/// <summary>Картата на мача (CONTRACT.md §13): място, серия, баунти, най-силно оръжие, кога не се записва.</summary>
public class MatchTests
{
    private const string A = "76561198000000001", B = "76561198000000002", C = "76561198000000003";
    private static readonly DateTimeOffset T0 = new(2026, 10, 24, 18, 0, 0, TimeSpan.Zero);

    private static MatchTracker Started()
    {
        var m = new MatchTracker();
        m.Begin(T0);
        return m;
    }

    [Fact]
    public void Място_по_убийства_после_смърти_после_в_главата()
    {
        var m = Started();
        m.Kill(A, "a", B, "b", "ak47", headshot: true, bountyClaimed: false, xp: 15);
        m.Kill(A, "a", C, "c", "ak47", headshot: false, bountyClaimed: false, xp: 10);
        m.Kill(B, "b", C, "c", "awp", headshot: false, bountyClaimed: true, xp: 35);
        m.Kill(C, "c", B, "b", "deagle", headshot: true, bountyClaimed: false, xp: 15);
        var s = m.Finish(T0.AddMinutes(30));
        Assert.NotNull(s);
        Assert.Equal(4, s.Kills);
        Assert.Equal([A, C, B], s.Players.Select(p => p.SteamId));
        Assert.Equal([1, 2, 3], s.Players.Select(p => p.Place));
        var a = s.Players[0];
        Assert.Equal((2, 0, 1, 2, 25, "ak47", 2), (a.Kills, a.Deaths, a.Headshots, a.BestStreak, a.Xp, a.TopWeapon, a.TopWeaponKills));
        var b = s.Players[2];
        Assert.Equal((1, 2, 1), (b.Kills, b.Deaths, b.BountiesClaimed));
    }

    [Fact]
    public void Серията_се_прекъсва_от_смърт_самоубийство_и_бот()
    {
        var m = Started();
        for (var i = 0; i < 3; i++) m.Kill(A, "a", B, "b", "ak47", false, false, 10);
        m.Death(A, "a");
        m.Kill(A, "a", B, "b", "ak47", false, false, 10);
        m.StreakBroken(A);
        m.Kill(A, "a", B, "b", "m4a1", false, false, 10);
        var s = m.Finish(T0.AddMinutes(5))!;
        var a = s.Players.Single(p => p.SteamId == A);
        Assert.Equal(3, a.BestStreak);
        Assert.Equal(1, a.Deaths);
        Assert.Equal("ak47", a.TopWeapon);
    }

    [Fact]
    public void Не_се_записва_без_убийство_твърде_къс_или_без_начало()
    {
        var empty = Started();
        empty.Death(A, "a");
        Assert.Null(empty.Finish(T0.AddMinutes(30)));
        var short_ = Started();
        short_.Kill(A, "a", B, "b", "ak47", false, false, 10);
        Assert.Null(short_.Finish(T0.AddSeconds(30)));
        var none = new MatchTracker();
        none.Kill(A, "a", B, "b", "ak47", false, false, 10);
        Assert.Null(none.Finish(T0.AddMinutes(30)));
    }

    [Fact]
    public void Нов_мач_изхвърля_стария_и_край_спира_следенето()
    {
        var m = Started();
        m.Kill(A, "a", B, "b", "ak47", false, false, 10);
        m.Begin(T0.AddMinutes(10));
        m.Kill(B, "b", A, "a", "awp", false, false, 10);
        var s = m.Finish(T0.AddMinutes(40))!;
        Assert.Equal(1, s.Kills);
        Assert.Equal(B, s.Players[0].SteamId);
        Assert.False(m.Running);
        Assert.Null(m.Finish(T0.AddMinutes(41)));
    }

    [Fact]
    public void Равно_оръжие_по_азбучен_ред_и_ник_от_последното_име()
    {
        var m = Started();
        m.Kill(A, "old", B, "b", "m4a1", false, false, 10);
        m.Kill(A, "new", B, "b", "ak47", false, false, 10);
        var a = m.Finish(T0.AddMinutes(30))!.Players[0];
        Assert.Equal("ak47", a.TopWeapon);
        Assert.Equal("new", a.Name);
    }
}
