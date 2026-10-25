using CarbonStealth.Logic;
using Xunit;

namespace CarbonStealth.Logic.Tests;

/// <summary>Горещата зона (CONTRACT §15): решетката, правилата, часовникът, кралят и двойното XP.</summary>
public class HotZoneTests
{
    /// <summary>Същите стойности като в app/tests/heatmap.test.ts (sectorLabel).</summary>
    [Theory]
    [InlineData(0f, 0f, "E6")]
    [InlineData(1500f, -500f, "H7")]
    [InlineData(-2400f, 3200f, "A1")]
    [InlineData(-3000f, 0f, null)]
    [InlineData(0f, 4000f, null)]
    public void Секторът_е_като_на_heatmap_а(float x, float y, string? label) =>
        Assert.Equal(label, Dust2Grid.SectorLabel(x, y));

    [Fact]
    public void Клетката_е_в_решетката_32_на_32()
    {
        Assert.Equal((17, 23), Dust2Grid.CellOf(0f, 0f));
        Assert.Null(Dust2Grid.CellOf(float.NaN, 0f));
        Assert.Equal(32, Dust2Grid.Grid);
        Assert.Equal(140.8, Dust2Grid.CellUnits, 3);
    }

    /// <summary>Същите стойности като hotZoneXp в app/tests/levels.test.ts.</summary>
    [Theory]
    [InlineData(15, true, 30)]
    [InlineData(15, false, 15)]
    [InlineData(7, true, 14)]
    [InlineData(-3, true, 0)]
    public void Двойно_XP_в_зоната(int xp, bool inZone, int expected) =>
        Assert.Equal(expected, Progression.HotZoneXp(xp, inZone));

    [Fact]
    public void В_зоната_двойното_е_след_множителя_и_след_делението_за_бот()
    {
        Assert.Equal(44, Progression.HotZoneXp(Progression.ApplyMultiplier(15, 15), true));
        Assert.Equal(14, Progression.HotZoneXp(Progression.BotKillXp(15), true));
    }

    [Theory]
    [InlineData(new[] { "Long", "A" }, "Long A", 250)]
    [InlineData(new[] { "Mid", "300" }, "Mid", 300)]
    [InlineData(new[] { "B_site-2" }, "B_site-2", 250)]
    [InlineData(new[] { "300" }, "300", 250)]
    public void Името_и_радиусът(string[] args, string name, int radius) =>
        Assert.Equal((name, radius), HotZoneRules.ParseAdd(args));

    /// <summary>Аргументите след „add“, разделени с „|“ (празно = без аргументи).</summary>
    [Theory]
    [InlineData("")]
    [InlineData("Mid|99")]
    [InlineData("Mid|801")]
    [InlineData("Мид")]
    [InlineData("a<b>")]
    [InlineData("AAAAAAAAAAAAAAAAAAAAAAAAA")]
    [InlineData(" | ")]
    public void Невалидното_се_отказва(string args) =>
        Assert.Null(HotZoneRules.ParseAdd(args.Length == 0 ? [] : args.Split('|')));

    [Fact]
    public void Вътре_е_кръг_по_хоризонтала_и_160_по_височина()
    {
        var zone = new HotZoneSpot(1, "Mid", 100f, 100f, 0f, 250);
        Assert.True(HotZoneRules.Contains(zone, 100f, 100f, 0f));
        Assert.True(HotZoneRules.Contains(zone, 350f, 100f, 160f));
        Assert.False(HotZoneRules.Contains(zone, 351f, 100f, 0f));
        Assert.False(HotZoneRules.Contains(zone, 100f, 100f, 161f), "катуокът над тунела не е вътре");
        Assert.False(HotZoneRules.Contains(zone, 100f, 100f, -161f));
    }

    [Fact]
    public void Зоните_се_редуват_без_тях_е_резервната()
    {
        var a = new HotZoneSpot(1, "A", 0, 0, 0, 250);
        var b = new HotZoneSpot(2, "B", 0, 0, 0, 250);
        var fallback = new HotZoneSpot(0, "C4", 0, 0, 0, 250);
        Assert.Equal(a, HotZoneRules.Pick([a, b], fallback, 0));
        Assert.Equal(b, HotZoneRules.Pick([a, b], fallback, 1));
        Assert.Equal(a, HotZoneRules.Pick([a, b], fallback, 2));
        Assert.Equal(b, HotZoneRules.Pick([a, b], fallback, -1));
        Assert.Equal(fallback, HotZoneRules.Pick([], fallback, 5));
        Assert.Null(HotZoneRules.Pick([], null, 0));
    }

    [Fact]
    public void Часовникът_старт_предупреждение_край_и_следващата_от_начало_до_начало()
    {
        var c = new HotZoneClock(everySeconds: 480);
        Assert.Equal(ZonePhase.None, c.Tick(10));
        Assert.Equal(ZonePhase.None, c.Tick(489));
        Assert.Equal(ZonePhase.Started, c.Tick(490));
        Assert.True(c.Active);
        Assert.Equal(180, c.SecondsLeft(490));
        Assert.Equal(ZonePhase.None, c.Tick(639));
        Assert.Equal(ZonePhase.Warned, c.Tick(640));
        Assert.Equal(ZonePhase.None, c.Tick(641));
        Assert.Equal(ZonePhase.Ended, c.Tick(670));
        Assert.False(c.Active);
        Assert.Equal(ZonePhase.None, c.Tick(969));
        Assert.Equal(ZonePhase.Started, c.Tick(970));
    }

    [Fact]
    public void Нулата_изключва_ресетът_и_времето_назад_почват_отначало()
    {
        var off = new HotZoneClock(0);
        Assert.False(off.Enabled);
        Assert.Equal(ZonePhase.None, off.Tick(1e6));

        var c = new HotZoneClock(240);
        c.Tick(0);
        Assert.Equal(ZonePhase.Started, c.Tick(240));
        c.Reset(250);
        Assert.False(c.Active);
        Assert.Equal(ZonePhase.None, c.Tick(489));
        Assert.Equal(ZonePhase.Started, c.Tick(490));
        // Нова карта: времето на играта почва от нула.
        Assert.Equal(ZonePhase.None, c.Tick(3));
        Assert.False(c.Active);
        Assert.Equal(ZonePhase.Started, c.Tick(243));
    }

    [Fact]
    public void Кралят_поне_3_при_равенство_който_стигне_пръв()
    {
        var r = new HotZoneRound();
        r.Kill("a", "Alpha");
        r.Kill("a", "Alpha");
        Assert.Null(r.King());
        r.Kill("b", "Bravo");
        r.Kill("b", "Bravo");
        r.Kill("b", "Bravo");
        r.Kill("a", "Alpha");
        Assert.Equal(new ZoneKing("b", "Bravo", 3), r.King());
        r.Kill("a", "Alpha");
        Assert.Equal(new ZoneKing("a", "Alpha", 4), r.King());
        Assert.Equal(3, r.KillsOf("b"));
        r.Clear();
        Assert.Null(r.King());
        Assert.Equal(0, r.KillsOf("a"));
    }
}
