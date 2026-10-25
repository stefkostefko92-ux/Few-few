using System.Text.Json;
using CarbonStealth.Logic;
using Xunit;

namespace CarbonStealth.Logic.Tests;

/// <summary>Здравето на тика (CONTRACT §5): закъснял = над 1,5 × интервала, паузата не е тик, минутата се нулира.</summary>
public class TickHealthTests
{
    private const double Budget = 15.625;

    [Fact]
    public void Брои_тиковете_закъснелите_и_най_дългия()
    {
        var h = new TickHealth(Budget);
        h.Record(16);
        h.Record(16);
        h.Record(23.4); // точно под 1,5 × 15,625 = 23,4375 — не е закъснял
        h.Record(40.6);
        var m = h.Flush(1000, 17, "All Weapons")!;
        Assert.Equal((4, 1, 40.6, 17, "All Weapons"), (m.Ticks, m.Late, m.MaxMs, m.Players, m.Mode));
        Assert.Equal(24.0, m.AvgMs);
        Assert.Equal(Budget, m.BudgetMs);
    }

    [Fact]
    public void Паузата_и_невалидното_не_са_тик_празна_минута_е_null()
    {
        var h = new TickHealth(Budget);
        h.Record(2500);
        h.Record(-1);
        h.Record(double.NaN);
        Assert.Null(h.Flush(1000, 0, ""));
        h.Record(16);
        Assert.NotNull(h.Flush(2000, 1, ""));
        Assert.Null(h.Flush(3000, 1, ""));
    }

    [Fact]
    public void Редът_има_полетата_на_панела()
    {
        var h = new TickHealth(Budget);
        h.Record(16);
        var json = JsonDocument.Parse(TickHealth.ToJson(h.Flush(1792828391000, 3, "Only Deagle")!)).RootElement;
        Assert.Equal(
            ["ts", "ticks", "late", "maxMs", "avgMs", "players", "mode", "budgetMs"],
            json.EnumerateObject().Select(p => p.Name));
        Assert.Equal(1792828391000, json.GetProperty("ts").GetInt64());
    }
}
