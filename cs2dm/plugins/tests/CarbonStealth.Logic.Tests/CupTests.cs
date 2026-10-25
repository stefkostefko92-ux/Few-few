using CarbonStealth.Logic;
using Xunit;

namespace CarbonStealth.Logic.Tests;

/// <summary>Седмицата на купата (CONTRACT §17): понеделник 00:00 – понеделник 00:00 в София, и при смяна на часа.</summary>
public class CupTests
{
    private static readonly TimeZoneInfo Sofia = MissionPool.ResolveZone("Europe/Sofia").Zone;

    private static DateTimeOffset Utc(string iso) => DateTimeOffset.Parse(iso, System.Globalization.CultureInfo.InvariantCulture);

    [Fact]
    public void Седмицата_започва_в_понеделник_в_полунощ_местно_време()
    {
        // Сряда, 28.10.2026 (зимно време, UTC+2).
        var w = CupRules.WeekOf(Utc("2026-10-28T12:00:00Z"), Sofia);
        Assert.Equal(new DateOnly(2026, 10, 26), w.Monday);
        Assert.Equal("2026-10-26", w.Key);
        Assert.Equal(Utc("2026-10-25T22:00:00Z"), w.Start);
        Assert.Equal(Utc("2026-11-01T22:00:00Z"), w.End);
    }

    [Fact]
    public void Неделя_23_59_е_още_старата_седмица_понеделник_00_00_е_новата()
    {
        var sunday = CupRules.WeekOf(Utc("2026-11-01T21:59:59Z"), Sofia);
        var monday = CupRules.WeekOf(Utc("2026-11-01T22:00:00Z"), Sofia);
        Assert.Equal(new DateOnly(2026, 10, 26), sunday.Monday);
        Assert.Equal(new DateOnly(2026, 11, 2), monday.Monday);
        Assert.Equal(sunday.End, monday.Start);
    }

    [Fact]
    public void Седмицата_със_смяната_на_часа_е_169_часа_и_лятната_започва_в_21_UTC()
    {
        // 25.10.2026 (неделя) часовникът се връща — седмицата 19–25.10 започва по лятно и свършва по зимно време.
        var w = CupRules.WeekOf(Utc("2026-10-25T12:00:00Z"), Sofia);
        Assert.Equal(new DateOnly(2026, 10, 19), w.Monday);
        Assert.Equal(Utc("2026-10-18T21:00:00Z"), w.Start);
        Assert.Equal(Utc("2026-10-25T22:00:00Z"), w.End);
        Assert.Equal(TimeSpan.FromHours(169), w.End - w.Start);
        // А пролетната (29.03.2026) — 167 часа.
        var spring = CupRules.WeekOf(Utc("2026-03-27T12:00:00Z"), Sofia);
        Assert.Equal(TimeSpan.FromHours(167), spring.End - spring.Start);
    }

    [Fact]
    public void В_UTC_седмицата_е_точно_седем_дни()
    {
        var w = CupRules.WeekOf(Utc("2026-10-25T23:30:00Z"), TimeZoneInfo.Utc);
        Assert.Equal(new DateOnly(2026, 10, 19), w.Monday);
        Assert.Equal(TimeSpan.FromDays(7), w.End - w.Start);
        Assert.Equal(("cup_winner", "cup_podium", 3), (CupRules.WinnerBadge, CupRules.PodiumBadge, CupRules.Podium));
    }
}
