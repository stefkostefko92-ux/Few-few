using CarbonStealth.Logic;
using Xunit;

namespace CarbonStealth.Logic.Tests;

/// <summary>Събитията по график (CONTRACT.md §12) — преходите и ефективният множител.</summary>
public class EventTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 24, 12, 0, 0, TimeSpan.Zero);

    private static ActiveEvent E(int id, int tenths = 15, int? mode = null) =>
        new(id, "XP_BOOST", "Уикенд", "Weekend", Now.AddHours(2), tenths, mode);

    [Fact]
    public void Начало_край_и_смяна_на_събитие()
    {
        var t = new EventTracker();
        Assert.True(t.Update(null).IsEmpty);
        var start = t.Update(E(1));
        Assert.Equal(1, start.Started?.Id);
        Assert.Null(start.Ended);
        Assert.True(t.Update(E(1)).IsEmpty, "същото събитие — нищо ново");
        var swap = t.Update(E(2));
        Assert.Equal(1, swap.Ended?.Id);
        Assert.Equal(2, swap.Started?.Id);
        var end = t.Update(null);
        Assert.Equal(2, end.Ended?.Id);
        Assert.Null(t.Current);
    }

    [Fact]
    public void Редактираното_събитие_е_промяна_без_нова_обява()
    {
        var t = new EventTracker();
        t.Update(E(1));
        var edited = t.Update(E(1, tenths: 20));
        Assert.Null(edited.Started);
        Assert.Null(edited.Ended);
        Assert.Equal(20, edited.Changed?.XpTenths);
    }

    [Theory]
    [InlineData(10, 15, 15)]
    [InlineData(20, 15, 20)]
    [InlineData(10, 99, 30)]
    public void Множителят_е_по_големият_от_настройката_и_събитието(int setting, int ev, int expected) =>
        Assert.Equal(expected, EventTracker.EffectiveXpTenths(setting, E(1, ev)));

    [Fact]
    public void Без_събитие_важи_настройката() => Assert.Equal(12, EventTracker.EffectiveXpTenths(12, null));

    [Fact]
    public void Свършило_между_проверките_не_дава_множител()
    {
        var t = new EventTracker();
        t.Update(E(1));
        Assert.NotNull(t.ActiveAt(Now));
        Assert.Null(t.ActiveAt(Now.AddHours(3)));
    }

    [Fact]
    public void Заглавието_е_на_езика_на_играча()
    {
        Assert.Equal("Уикенд", E(1).Title(bulgarian: true));
        Assert.Equal("Weekend", E(1).Title(bulgarian: false));
    }
}
