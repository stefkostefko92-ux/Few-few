using System.Diagnostics;
using CarbonStealth.Logic;
using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Modules.Timers;

namespace CarbonStealth;

/// <summary>
/// „Здраве на тика“ (CONTRACT §5): истинското време между тиковете (Stopwatch в OnTick) спрямо интервала на
/// играта, агрегирано по минута → последната минута в cs2dm:live (`perf`) и списъкът cs2dm:perf за панела (24 ч).
/// На тик само едно изваждане — никакво заделяне на памет и никакъв вход/изход в игровата нишка.
/// </summary>
public sealed partial class CarbonStealthPlugin
{
    private readonly TickHealth _tickHealth = new(Server.TickInterval * 1000.0);
    private long _lastTickStamp;
    private PerfMinute? _lastPerf;

    private void RegisterTickHealth()
    {
        RegisterListener<Listeners.OnTick>(() =>
        {
            var now = Stopwatch.GetTimestamp();
            if (_lastTickStamp != 0) _tickHealth.Record(Stopwatch.GetElapsedTime(_lastTickStamp, now).TotalMilliseconds);
            _lastTickStamp = now;
        });
        // Зареждането на картата не е закъснял тик.
        RegisterListener<Listeners.OnMapStart>(_ => _lastTickStamp = 0);
        AddTimer(60f, FlushTickHealth, TimerFlags.REPEAT);
    }

    private void FlushTickHealth()
    {
        var humans = Utilities.GetPlayers()
            .Count(p => p is { IsValid: true, IsBot: false } && p.Connected == PlayerConnectedState.Connected);
        if (_tickHealth.Flush(DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), humans, CurrentModeName()) is not { } minute) return;
        _lastPerf = minute;
        _bridge?.PushPerf(TickHealth.ToJson(minute));
    }

    /// <summary>Последната затворена минута за cs2dm:live; null, докато няма такава.</summary>
    private object? LivePerf() => _lastPerf is { } p
        ? new { ticks = p.Ticks, late = p.Late, maxMs = p.MaxMs, avgMs = p.AvgMs, budgetMs = p.BudgetMs }
        : null;
}
