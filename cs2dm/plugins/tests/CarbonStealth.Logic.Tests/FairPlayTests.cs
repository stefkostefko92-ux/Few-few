using CarbonStealth.Logic;
using Xunit;

namespace CarbonStealth.Logic.Tests;

public class AfkTests
{
    private static readonly InputSample Still = new(0, 10f, 90f, 7);

    /// <summary>Пуска N засичания по 1 s и връща последното ненулево решение.</summary>
    private static FairPlayEvent Run(AfkTracker afk, int seconds, InputSample sample, bool counting = true)
    {
        var last = FairPlayEvent.None;
        for (var i = 0; i < seconds; i++)
        {
            var e = afk.Observe(1, sample, 1, counting);
            if (e.Verdict != FairPlayVerdict.None) last = e;
        }
        return last;
    }

    [Fact]
    public void Без_вход_предупреждение_после_наблюдател()
    {
        var afk = new AfkTracker(90);
        Assert.Equal(20, afk.WarnLeadSeconds);
        afk.Observe(1, Still, 1, true); // първото засичане е само отправна точка
        var warn = Run(afk, 70, Still);
        Assert.Equal(FairPlayVerdict.Warn, warn.Verdict);
        Assert.Equal(20, warn.Value);
        Assert.Equal(FairPlayVerdict.Move, Run(afk, 19, Still).Verdict); // 1 + 70 + 19 = 90 s
        Assert.Equal(0, afk.IdleSeconds(1)); // след преместването — начисто
    }

    [Fact]
    public void Мишката_или_клавиш_нулират_броенето()
    {
        var afk = new AfkTracker(90);
        Run(afk, 60, Still);
        afk.Observe(1, Still with { Yaw = 95f }, 1, true);
        Assert.Equal(0, afk.IdleSeconds(1));
        Run(afk, 60, Still with { Yaw = 95f });
        afk.Observe(1, Still with { Yaw = 95f, Buttons = 8 }, 1, true);
        Assert.Equal(0, afk.IdleSeconds(1));
    }

    [Fact]
    public void Шумът_в_погледа_не_е_вход_а_359_към_1_градус_е()
    {
        Assert.False(Still.AnglesDifferFrom(Still with { Yaw = 90.3f }));
        Assert.Equal(2f, InputSample.AngleDelta(359f, 1f), 3);
        Assert.True(new InputSample(0, 0, 359f, 1).AnglesDifferFrom(new InputSample(0, 0, 1f, 1)));
    }

    [Fact]
    public void Мъртъв_или_изключение_е_пауза_не_нулиране()
    {
        var afk = new AfkTracker(90);
        Run(afk, 50, Still);
        var before = afk.IdleSeconds(1);
        Run(afk, 30, Still, counting: false);
        Assert.Equal(before, afk.IdleSeconds(1));
    }

    [Fact]
    public void Респаун_с_нов_поглед_не_е_вход()
    {
        var afk = new AfkTracker(90);
        Run(afk, 50, Still);
        afk.Observe(1, Still, 1, counting: false); // умря
        // Играта го ражда другаде и го завърта — новото засичане е отправна точка, не движение.
        afk.Observe(1, Still with { Yaw = 200f, Pitch = 0f }, 1, true);
        Assert.Equal(51, afk.IdleSeconds(1));
        // Ново тяло без смърт между засичанията — също.
        afk.Observe(1, Still with { Yaw = 10f, Pawn = 8 }, 1, true);
        Assert.Equal(52, afk.IdleSeconds(1));
    }

    [Fact]
    public void Нула_изключва_проверката()
    {
        var afk = new AfkTracker(0);
        Assert.Equal(FairPlayVerdict.None, Run(afk, 5000, Still).Verdict);
    }

    [Fact]
    public void Предупреждението_е_веднъж_и_пак_след_активност()
    {
        var afk = new AfkTracker(30);
        Assert.Equal(10, afk.WarnLeadSeconds);
        afk.Observe(1, Still, 1, true);
        var warns = 0;
        for (var i = 0; i < 25; i++)
        {
            if (afk.Observe(1, Still, 1, true).Verdict == FairPlayVerdict.Warn) warns++;
        }
        Assert.Equal(1, warns);
        afk.Observe(1, Still with { Buttons = 1 }, 1, true);
        Assert.Equal(FairPlayVerdict.Warn, Run(afk, 20, Still with { Buttons = 1 }).Verdict);
    }
}

public class PingTests
{
    [Fact]
    public void Нужен_е_пълен_прозорец()
    {
        var ping = new PingMonitor(150, windowSamples: 30, graceSamples: 15);
        for (var i = 0; i < 29; i++) Assert.Equal(FairPlayVerdict.None, ping.Observe(1, 400, true).Verdict);
        var warn = ping.Observe(1, 400, true);
        Assert.Equal(FairPlayVerdict.Warn, warn.Verdict);
        Assert.Equal(400, warn.Value);
    }

    [Fact]
    public void Устойчиво_висок_пинг_след_предупреждение_води_до_наблюдател()
    {
        var ping = new PingMonitor(150, 30, 15);
        for (var i = 0; i < 30; i++) ping.Observe(1, 200, true);
        for (var i = 0; i < 14; i++) Assert.Equal(FairPlayVerdict.None, ping.Observe(1, 200, true).Verdict);
        var moved = ping.Observe(1, 200, true);
        Assert.Equal(FairPlayVerdict.Move, moved.Verdict);
        Assert.Equal(200, moved.Value);
    }

    [Fact]
    public void Кратък_скок_не_е_висок_пинг_и_спадът_прощава()
    {
        var ping = new PingMonitor(150, 30, 15);
        for (var i = 0; i < 25; i++) ping.Observe(1, 60, true);
        for (var i = 0; i < 5; i++) Assert.Equal(FairPlayVerdict.None, ping.Observe(1, 500, true).Verdict); // средно 133
        FairPlayEvent e;
        var n = 0;
        do { e = ping.Observe(1, 300, true); } while (e.Verdict == FairPlayVerdict.None && ++n < 30);
        Assert.Equal(FairPlayVerdict.Warn, e.Verdict);
        // Връзката се оправя → без наблюдател, а следващият висок пинг започва пак с предупреждение.
        for (var i = 0; i < 30; i++) Assert.NotEqual(FairPlayVerdict.Move, ping.Observe(1, 20, true).Verdict);
        do { e = ping.Observe(1, 400, true); } while (e.Verdict == FairPlayVerdict.None);
        Assert.Equal(FairPlayVerdict.Warn, e.Verdict);
    }

    [Fact]
    public void Наблюдател_и_нула_не_се_следят()
    {
        var off = new PingMonitor(0);
        for (var i = 0; i < 100; i++) Assert.Equal(FairPlayVerdict.None, off.Observe(1, 999, true).Verdict);
        var ping = new PingMonitor(150, 30, 15);
        for (var i = 0; i < 29; i++) ping.Observe(1, 400, true);
        ping.Observe(1, 400, counting: false); // мина при наблюдателите → прозорецът се изчиства
        Assert.Equal(FairPlayVerdict.None, ping.Observe(1, 400, true).Verdict);
    }
}
