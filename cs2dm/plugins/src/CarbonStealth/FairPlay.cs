using CarbonStealth.Logic;
using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Core.Translations;
using CounterStrikeSharp.API.Modules.Timers;
using CounterStrikeSharp.API.Modules.Utils;
using Microsoft.Extensions.Logging;

namespace CarbonStealth;

/// <summary>
/// Честна игра без изритване: AFK (жив играч без вход <see cref="PluginConfig.AfkSeconds"/>) и устойчиво висок
/// пинг (<see cref="PluginConfig.MaxPing"/>) → предупреждение, после наблюдател. Екипът (HELPER+) и админ с
/// отворено WASD меню (държим го замръзнал нарочно) са изключение. Логиката — <see cref="AfkTracker"/> и
/// <see cref="PingMonitor"/> в CarbonStealth.Logic; тук само засичаме и местим.
/// </summary>
public sealed partial class CarbonStealthPlugin
{
    private const float FairPlayTick = 1f;

    private AfkTracker _afk = new(0);
    private PingMonitor _ping = new(0);

    private void RegisterFairPlay()
    {
        _afk = new AfkTracker(Config.AfkSeconds);
        _ping = new PingMonitor(Config.MaxPing);
        if (Config.AfkSeconds <= 0 && Config.MaxPing <= 0) return;
        RegisterListener<Listeners.OnClientDisconnect>(slot =>
        {
            _afk.Forget(slot);
            _ping.Forget(slot);
        });
        AddTimer(FairPlayTick, CheckFairPlay, TimerFlags.REPEAT);
    }

    private void CheckFairPlay()
    {
        foreach (var player in Utilities.GetPlayers().Where(p => p is { IsValid: true, IsBot: false }))
        {
            var slot = player.Slot;
            // Ролята още не е заредена → не знаем дали е от екипа; по-добре да не го пипаме.
            var exempt = _players.BySlot(slot) is not { Loaded: true } state || state.Role >= Role.Helper;
            var playing = player.Team is CsTeam.Terrorist or CsTeam.CounterTerrorist;

            var pawn = player.PlayerPawn.Value;
            var alive = player.PawnIsAlive && pawn is { IsValid: true };
            var buttons = player.Pawn.Value?.MovementServices is { } ms ? ms.Buttons.ButtonStates[0] : 0UL;
            var sample = alive
                ? new InputSample(buttons, pawn!.EyeAngles.X, pawn.EyeAngles.Y, pawn.EntityHandle.Raw)
                : new InputSample(buttons, 0f, 0f, 0);
            var afk = _afk.Observe(slot, sample, FairPlayTick, playing && alive && !exempt && !_huds.ContainsKey(slot));
            if (afk.Verdict == FairPlayVerdict.Warn) WarnAfk(player, afk.Value);
            else if (afk.Verdict == FairPlayVerdict.Move)
            {
                MoveToSpectators(player, "afk");
                continue;
            }

            var ping = _ping.Observe(slot, (int)Math.Min(player.Ping, 9999u), playing && !exempt);
            if (ping.Verdict == FairPlayVerdict.Warn) Tell(slot, "ping.warn", ping.Value, Config.MaxPing);
            else if (ping.Verdict == FairPlayVerdict.Move) MoveToSpectators(player, "ping", ping.Value);
        }
    }

    private void WarnAfk(CCSPlayerController player, int secondsLeft)
    {
        Tell(player.Slot, "afk.warn", secondsLeft);
        var text = HudMenuRenderer.Escape(Localizer.ForPlayer(player, "hud.afk", secondsLeft));
        player.PrintToCenterHtml($"<font color='{HudMenuRenderer.Gold}' class='fontSize-l'><b>{text}</b></font>", 5);
    }

    /// <summary>Наблюдател, не kick: връща се сам с M (избор на отбор), когато е готов.</summary>
    private void MoveToSpectators(CCSPlayerController player, string why, int averagePing = 0)
    {
        var slot = player.Slot;
        _afk.Forget(slot);
        _ping.Forget(slot);
        player.ChangeTeam(CsTeam.Spectator);
        if (why == "afk") Tell(slot, "afk.moved");
        else Tell(slot, "ping.moved", averagePing, Config.MaxPing);
        Logger.LogInformation("CarbonStealth: slot {Slot} moved to spectators ({Why})", slot, why);
    }
}
