using CarbonStealth.Logic;
using Xunit;

namespace CarbonStealth.Logic.Tests;

/// <summary>Живите настройки (CONTRACT.md §11) — същите случаи като tests/settings.test.ts в сайта.</summary>
public class SettingsTests
{
    private static readonly ServerSettings Config = ServerSettings.FromConfig(240, true);

    private static ServerSettings Parse(Dictionary<string, string> rows, List<string>? invalid = null) =>
        ServerSettings.Parse(rows, Config, invalid);

    [Fact]
    public void Без_редове_важи_конфигът()
    {
        var s = Parse([]);
        Assert.Equal(240, s.Adverts.IntervalSec);
        Assert.Equal(ServerSettings.BuiltinAdverts, s.Adverts.Builtin);
        Assert.True(s.InfiniteAmmo);
        Assert.Null(s.BotQuota);
        Assert.Equal(10, s.XpTenths);
        Assert.True(s.Welcome);
        Assert.Equal(240, ServerSettings.FromConfig(5, false).Adverts.IntervalSec);
    }

    [Fact]
    public void Валидните_редове_се_прилагат()
    {
        var s = Parse(new()
        {
            ["adverts"] = """{"intervalSec":600,"builtin":{"carbonstealth":false,"adblock":true,"site":true},"custom":{"bg":["Здрасти"],"en":["Hi","Join"]}}""",
            ["ammo"] = """{"infiniteReserve":false}""",
            ["bots"] = """{"quota":16}""",
            ["xp"] = """{"multiplier":1.5}""",
            ["join"] = """{"welcome":false}""",
            ["unknown"] = """{"x":1}""",
        });
        Assert.Equal(600, s.Adverts.IntervalSec);
        Assert.Equal(["adblock", "site"], s.Adverts.Builtin);
        Assert.Equal(["Здрасти"], s.Adverts.CustomBg);
        Assert.Equal(["Hi", "Join"], s.Adverts.CustomEn);
        Assert.False(s.InfiniteAmmo);
        Assert.Equal(16, s.BotQuota);
        Assert.Equal(15, s.XpTenths);
        Assert.False(s.Welcome);
    }

    [Theory]
    [InlineData("adverts", """{"intervalSec":30,"builtin":{"carbonstealth":true,"adblock":true,"site":true},"custom":{"bg":[],"en":[]}}""")]
    [InlineData("adverts", """{"intervalSec":60,"builtin":{},"custom":{"bg":[],"en":[]}}""")]
    [InlineData("adverts", """{"intervalSec":60,"builtin":{"carbonstealth":true,"adblock":true,"site":true},"custom":{"bg":["1","2","3","4","5","6"],"en":[]}}""")]
    [InlineData("bots", """{"quota":17}""")]
    [InlineData("bots", """{"quota":"4"}""")]
    [InlineData("xp", """{"multiplier":3.1}""")]
    [InlineData("xp", """{"multiplier":1.55}""")]
    [InlineData("xp", """{"multiplier":0.5}""")]
    [InlineData("ammo", """{"infiniteReserve":"yes"}""")]
    [InlineData("join", "[]")]
    [InlineData("join", "not json")]
    public void Повреден_ред_пада_към_конфига(string key, string json)
    {
        var invalid = new List<string>();
        Assert.Equal(Config, Parse(new() { [key] = json }, invalid));
        Assert.Equal([key], invalid);
    }

    [Fact]
    public void Собствените_текстове_се_чистят_като_чата()
    {
        var s = Parse(new()
        {
            ["adverts"] = """{"intervalSec":0,"builtin":{"carbonstealth":false,"adblock":false,"site":false},"custom":{"bg":["{Red}Ч\u0007ат","   "],"en":[]}}""",
        });
        Assert.Equal(0, s.Adverts.IntervalSec);
        Assert.Equal(["(Red)Чат"], s.Adverts.CustomBg);
        Assert.Equal(["custom:0"], AdvertPlan.Slots(s.Adverts));
    }

    [Fact]
    public void Ротацията_вградени_после_собствени_на_езика_на_играча()
    {
        var a = new AdvertSettings(240, ["carbonstealth", "site"], ["Б1"], ["E1", "E2"]);
        var slots = AdvertPlan.Slots(a);
        Assert.Equal(["advert.carbonstealth", "advert.site", "custom:0", "custom:1"], slots);
        Assert.True(AdvertPlan.TryCustomIndex("custom:1", out var i));
        Assert.Equal(1, i);
        Assert.False(AdvertPlan.TryCustomIndex("advert.site", out _));
        Assert.Equal("Б1", AdvertPlan.CustomText(a, 0, bulgarian: true));
        Assert.Equal("E1", AdvertPlan.CustomText(a, 0, bulgarian: false));
        Assert.Equal("E2", AdvertPlan.CustomText(a, 1, bulgarian: true));
        Assert.Null(AdvertPlan.CustomText(a, 2, bulgarian: true));
    }

    // Същите стойности като applyXpMultiplier в levels.ts (tests/settings.test.ts).
    [Theory]
    [InlineData(15, 15, 22)]
    [InlineData(10, 30, 30)]
    [InlineData(7, 10, 7)]
    [InlineData(25, 12, 30)]
    [InlineData(10, 99, 30)]
    [InlineData(10, 0, 10)]
    public void Множителят_на_XP_е_в_десети_без_float(int xp, int tenths, int expected) =>
        Assert.Equal(expected, Progression.ApplyMultiplier(xp, tenths));

    [Fact]
    public void Множителят_за_показ() => Assert.Equal("1.5", ServerSettings.FormatTenths(15));

    [Fact]
    public void Мостът_приема_settings_reload() => Assert.Contains("settings.reload", BridgeProtocol.Actions);
}
