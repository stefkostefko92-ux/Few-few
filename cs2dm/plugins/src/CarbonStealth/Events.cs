using System.Globalization;
using CarbonStealth.Data;
using CarbonStealth.Logic;
using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Core.Translations;
using CounterStrikeSharp.API.Modules.Timers;
using Microsoft.Extensions.Logging;

namespace CarbonStealth;

/// <summary>
/// Събития по график (CONTRACT.md §12): проверка на 30 s. При старт — обява в чата и в центъра на езика
/// на всеки играч, DM режимът на събитието (ако има) и множител на XP = max(настройка, събитие); при
/// край — обява и връщане на режима отпреди. DM ротацията сменя режима сама → докато трае събитието,
/// режимът се налага наново и се записва като следващ.
/// </summary>
public sealed partial class CarbonStealthPlugin
{
    private readonly EventTracker _events = new();
    /// <summary>Режимът преди първото събитие с режим — към него се връщаме при края.</summary>
    private int? _modeBeforeEvent;

    private void RegisterEvents()
    {
        AddTimer(30f, CheckEvents, TimerFlags.REPEAT);
        AddTimer(3f, CheckEvents);
    }

    private void CheckEvents()
    {
        if (_db is not { } db) return;
        RunDb(db.ActiveEventAsync, ApplyEvent, "events");
    }

    private void ApplyEvent(ActiveEvent? next)
    {
        var change = _events.Update(next);
        if (change.Ended is { } ended) EndEvent(ended, keepMode: change.Started?.DmModeId is not null);
        if (change.Started is { } started) StartEvent(started);
        if (change.Changed is { } edited) Logger.LogInformation("CarbonStealth: event {Id} was edited", edited.Id);
        if (_events.Current is { DmModeId: { } mode }) EnforceEventMode(mode);
    }

    private void StartEvent(ActiveEvent e)
    {
        Logger.LogInformation("CarbonStealth: event {Id} ({Kind}) started", e.Id, e.Kind);
        if (e.DmModeId is { } mode && _dm is { } dm)
        {
            _modeBeforeEvent ??= SafeActiveMode(dm);
            TryStartMode(mode);
        }
        AnnounceEvent(e, "event.start", "hud.event.start");
    }

    private void EndEvent(ActiveEvent e, bool keepMode)
    {
        Logger.LogInformation("CarbonStealth: event {Id} ended", e.Id);
        AnnounceEvent(e, "event.end", "hud.event.end");
        if (keepMode || _modeBeforeEvent is not { } previous) return;
        _modeBeforeEvent = null;
        TryStartMode(previous);
    }

    private void EnforceEventMode(int mode)
    {
        if (_dm is not { } dm) return;
        try
        {
            dm.SetNextMode(mode);
            if (dm.GetActiveModeId() != mode) dm.StartCustomMode(mode);
        }
        catch (Exception ex)
        {
            Logger.LogWarning(ex, "CarbonStealth: event mode {Mode} could not be kept", mode);
        }
    }

    private void TryStartMode(int mode)
    {
        try
        {
            _dm?.StartCustomMode(mode);
        }
        catch (Exception ex)
        {
            // Непознат режим (Deathmatch.json е сменен) — събитието продължава само с множителя.
            Logger.LogWarning(ex, "CarbonStealth: event mode {Mode} failed", mode);
        }
    }

    private int? SafeActiveMode(DeathmatchAPI.IDeathmatchAPI dm)
    {
        try
        {
            return dm.GetActiveModeId();
        }
        catch (Exception ex)
        {
            Logger.LogDebug(ex, "CarbonStealth: active mode unknown");
            return null;
        }
    }

    /// <summary>Чат + център за всеки на неговия език; центърът не пречи на отворено WASD меню.</summary>
    private void AnnounceEvent(ActiveEvent e, string chatKey, string hudKey)
    {
        var multiplier = ServerSettings.FormatTenths(e.XpTenths);
        var until = e.EndsAt.UtcDateTime.ToString("yyyy-MM-dd HH:mm 'UTC'", CultureInfo.InvariantCulture);
        foreach (var p in Utilities.GetPlayers().Where(p => p is { IsValid: true, IsBot: false }))
        {
            var title = e.Title(IsBulgarian(p));
            p.PrintToChat(Localizer.ForPlayer(p, chatKey, title, multiplier, until));
            if (_huds.ContainsKey(p.Slot)) continue;
            var text = HudMenuRenderer.Escape(Localizer.ForPlayer(p, hudKey, title, multiplier));
            p.PrintToCenterHtml($"<font color='{HudMenuRenderer.Gold}' class='fontSize-l'><b>{text}</b></font>", 8);
        }
    }

    /// <summary>При влизане: каква е текущата игра (ако поздравът е включен — §11 „join“).</summary>
    private void TellActiveEvent(CCSPlayerController player)
    {
        if (_events.ActiveAt(DateTimeOffset.UtcNow) is not { } e) return;
        var until = e.EndsAt.UtcDateTime.ToString("yyyy-MM-dd HH:mm 'UTC'", CultureInfo.InvariantCulture);
        player.PrintToChat(Localizer.ForPlayer(player, "event.active", e.Title(IsBulgarian(player)),
            ServerSettings.FormatTenths(e.XpTenths), until));
    }
}
