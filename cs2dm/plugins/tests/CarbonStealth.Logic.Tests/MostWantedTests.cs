using CarbonStealth.Logic;
using Xunit;

namespace CarbonStealth.Logic.Tests;

/// <summary>Most Wanted (CONTRACT §15): поне 10 убийства, равенството пази титлата, излезлият я губи.</summary>
public class MostWantedTests
{
    private static void Kills(MostWantedBoard b, string id, int n, List<bool>? changes = null)
    {
        for (var i = 0; i < n; i++)
        {
            var changed = b.Kill(id, id.ToUpperInvariant());
            changes?.Add(changed);
        }
    }

    [Fact]
    public void Титлата_идва_с_десетото_убийство()
    {
        var b = new MostWantedBoard();
        var changes = new List<bool>();
        Kills(b, "a", 10, changes);
        Assert.Equal([false, false, false, false, false, false, false, false, false, true], changes);
        Assert.Equal("a", b.Current);
        Assert.Equal("A", b.CurrentName);
        Assert.Equal(10, b.KillsOf("a"));
    }

    [Fact]
    public void Равенството_пази_носителя_строго_повече_я_взема()
    {
        var b = new MostWantedBoard();
        Kills(b, "a", 10);
        Kills(b, "b", 9);
        Assert.False(b.Kill("b", "B"), "10 срещу 10 — остава a");
        Assert.Equal("a", b.Current);
        Assert.True(b.Kill("b", "B"));
        Assert.Equal("b", b.Current);
    }

    [Fact]
    public void Излезлият_я_губи_без_носител_равенството_е_за_първия()
    {
        var b = new MostWantedBoard();
        Kills(b, "a", 12);
        Kills(b, "b", 11);
        Kills(b, "c", 11);
        Assert.Equal("a", b.Current);
        Assert.True(b.SyncPresence(new HashSet<string> { "b", "c" }));
        Assert.Equal("b", b.Current);
        Assert.True(b.SyncPresence(new HashSet<string>()));
        Assert.Null(b.Current);
        Assert.Null(b.CurrentName);
        // Върнал се — с първото си убийство (13) взема титлата обратно.
        Assert.True(b.Kill("a", "A"));
        Assert.Equal("a", b.Current);
    }

    [Fact]
    public void Нова_карта_нулира()
    {
        var b = new MostWantedBoard();
        Kills(b, "a", 10);
        b.Reset();
        Assert.Null(b.Current);
        Assert.Equal(0, b.KillsOf("a"));
    }

    /// <summary>Същите стойности като mostWantedBonus в app/tests/levels.test.ts.</summary>
    [Fact]
    public void Бонусът_е_преди_множителя_и_зоната()
    {
        Assert.Equal(25, Progression.MostWantedBonus(true));
        Assert.Equal(0, Progression.MostWantedBonus(false));
        var xp = Progression.ApplyMultiplier(15 + Progression.MostWantedBonus(true), 15);
        Assert.Equal(60, xp);
        Assert.Equal(120, Progression.HotZoneXp(xp, true));
    }
}
