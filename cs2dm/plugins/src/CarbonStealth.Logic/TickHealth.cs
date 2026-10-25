using System.Text.Json;

namespace CarbonStealth.Logic;

/// <summary>Една минута „здраве на тика“ (CONTRACT §5): колко тика, колко закъснели, най-дългият и средният интервал.</summary>
public sealed record PerfMinute(long Ts, int Ticks, int Late, double MaxMs, double AvgMs, int Players, string Mode, double BudgetMs);

/// <summary>
/// Мери истинското време между тиковете (Stopwatch в OnTick) спрямо интервала на играта. Закъснял е тик над
/// 1,5 × интервала; над 2 s е пауза (сън на празен сървър, зареждане на карта) — не се брои като тик.
/// Чиста логика: плъгинът вика Record на всеки тик и Flush веднъж в минута. Само от игровата нишка.
/// </summary>
public sealed class TickHealth(double budgetMs)
{
    public const double LateFactor = 1.5;
    public const double PauseMs = 2000;

    private int _ticks;
    private int _late;
    private double _sum;
    private double _max;

    public double BudgetMs { get; } = budgetMs;

    public double LateMs => BudgetMs * LateFactor;

    public void Record(double gapMs)
    {
        if (gapMs < 0 || gapMs > PauseMs || double.IsNaN(gapMs)) return;
        _ticks++;
        _sum += gapMs;
        if (gapMs > _max) _max = gapMs;
        if (gapMs > LateMs) _late++;
    }

    /// <summary>Затваря минутата; без нито един тик (празен сървър спи) → null.</summary>
    public PerfMinute? Flush(long tsMs, int players, string mode)
    {
        if (_ticks == 0) return null;
        var minute = new PerfMinute(tsMs, _ticks, _late, Math.Round(_max, 1), Math.Round(_sum / _ticks, 2),
            Math.Max(0, players), Text.SafeText(mode, 64), BudgetMs);
        _ticks = 0;
        _late = 0;
        _sum = 0;
        _max = 0;
        return minute;
    }

    /// <summary>Редът в cs2dm:perf — същите полета, които чете панелът (app/src/admin/perf.ts).</summary>
    public static string ToJson(PerfMinute m) => JsonSerializer.Serialize(new
    {
        ts = m.Ts,
        ticks = m.Ticks,
        late = m.Late,
        maxMs = m.MaxMs,
        avgMs = m.AvgMs,
        players = m.Players,
        mode = m.Mode,
        budgetMs = m.BudgetMs,
    });
}
