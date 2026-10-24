using CarbonStealth.Logic;
using Xunit;

namespace CarbonStealth.Logic.Tests;

/// <summary>Партидата и епохата на статистиките (CONTRACT.md §3) — „player.reload“ от панела.</summary>
public class StatsBatchTests
{
    private const string A = "76561198000000001", B = "76561198000000002";

    private static StatsBatch With(string id, int epoch, int kills, string weapon = "ak47")
    {
        var b = new StatsBatch();
        b.For(id, "a", epoch).Kills += kills;
        for (var i = 0; i < kills; i++) b.AddWeapon(id, epoch, weapon, headshot: i == 0);
        return b;
    }

    [Fact]
    public void Нова_епоха_изхвърля_натрупаното_със_старата()
    {
        var b = With(A, 0, 3);
        b.For(B, "b", 0).Deaths++;
        var d = b.For(A, "a", 1);
        Assert.Equal(0, d.Kills);
        Assert.Equal(1, d.Epoch);
        Assert.DoesNotContain(b.Weapons.Keys, k => k.SteamId == A);
        Assert.Equal(1, b.For(B, "b", 0).Deaths);
    }

    [Fact]
    public void Стара_епоха_не_маха_по_новата()
    {
        var b = With(A, 2, 1);
        Assert.Equal(1, b.For(A, "a", 1).Kills);
        Assert.Equal(2, b.EpochOf(A));
        Assert.Equal(0, b.EpochOf(B));
    }

    [Fact]
    public void Discard_маха_само_този_играч_и_оставя_суровите_убийства()
    {
        var b = With(A, 0, 2);
        b.AddWeapon(B, 0, "awp", headshot: false);
        b.Kills.Add(new KillRow(DateTimeOffset.UnixEpoch, "dm", A, B, "ak47", false, false, false, false, false, 1, 0, 0, 0, 0, 0, 0));
        Assert.True(b.Discard(A));
        Assert.False(b.Players.ContainsKey(A));
        Assert.Equal([(B, "awp")], b.Weapons.Keys);
        Assert.Single(b.Kills);
        Assert.False(b.Discard(A));
    }

    [Fact]
    public void Върната_партида_със_същата_епоха_се_слива()
    {
        var current = With(A, 1, 1);
        current.Merge(With(A, 1, 2));
        Assert.Equal(3, current.Players[A].Kills);
        Assert.Equal((3, 2), current.Weapons[(A, "ak47")]);
    }

    [Fact]
    public void Върната_партида_отпреди_редакцията_се_пропуска()
    {
        var current = With(A, 2, 1);
        current.Merge(With(A, 1, 5));
        Assert.Equal(1, current.Players[A].Kills);
        Assert.Equal((1, 1), current.Weapons[(A, "ak47")]);
    }

    [Fact]
    public void Върната_партида_без_нищо_ново_за_играча_влиза_със_своята_епоха()
    {
        var current = new StatsBatch();
        current.Merge(With(A, 1, 2));
        Assert.Equal(1, current.EpochOf(A));
        // Следващото убийство с новата епоха изхвърля върнатото (базата също би го отхвърлила).
        Assert.Equal(0, current.For(A, "a", 2).Kills);
    }

    [Theory]
    [InlineData(0, 0, EpochChange.Same)]
    [InlineData(0, 3, EpochChange.Newer)]
    [InlineData(3, 2, EpochChange.Stale)]
    public void Епохата_от_базата(int known, int fromDb, EpochChange expected) =>
        Assert.Equal(expected, StatsEpochs.Compare(known, fromDb));

    [Fact]
    public void Мостът_приема_player_reload() => Assert.Contains("player.reload", BridgeProtocol.Actions);
}
