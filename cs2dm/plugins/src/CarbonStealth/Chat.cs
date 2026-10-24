using CarbonStealth.Logic;
using CarbonStealth.State;
using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Core.Translations;
using CounterStrikeSharp.API.Modules.Commands;
using CounterStrikeSharp.API.Modules.Utils;

namespace CarbonStealth;

public sealed partial class CarbonStealthPlugin
{
    private void RegisterChat()
    {
        AddCommandListener("say", (p, info) => OnSay(p, info, team: false));
        AddCommandListener("say_team", (p, info) => OnSay(p, info, team: true));
    }

    /// <summary>
    /// Чатът на хората: gag се спира тук; иначе съобщението се пише наново с таг и цвят и
    /// се праща към панела (кратък Redis поток — чатът не се пази в базата).
    /// Командите (!gun, /rank…) минават непокътнати към CounterStrikeSharp.
    /// </summary>
    private HookResult OnSay(CCSPlayerController? player, CommandInfo info, bool team)
    {
        if (player is not { IsValid: true } || player.IsBot) return HookResult.Continue;
        var raw = info.GetArg(1);
        if (string.IsNullOrWhiteSpace(raw) || raw[0] is '!' or '/') return HookResult.Continue;

        var state = _players.BySlot(player.Slot);
        var now = DateTimeOffset.UtcNow;
        if (state?.ChatBlock(now) is { } gag)
        {
            player.PrintToChat(Localizer.ForPlayer(player, "gagged", When(player, gag.ExpiresAt)));
            return HookResult.Handled;
        }

        var text = Text.SafeText(raw);
        if (text.Length == 0) return HookResult.Handled;
        var name = state?.Name ?? Text.SafeName(player.PlayerName);
        var line = $" {TagColor(state, now)}{TagFor(state, now)} {ChatColors.ForPlayer(player)}{name}{ChatColors.Default}: {text}";
        if (team) line = $" {ChatColors.Grey}(team){ChatColors.Default}{line}";

        foreach (var p in Utilities.GetPlayers().Where(p => p is { IsValid: true, IsBot: false }))
        {
            if (!team || p.Team == player.Team) p.PrintToChat(line);
        }
        _bridge?.Event("chat", new { steamId = state?.SteamId64, name, text, team });
        return HookResult.Handled;
    }

    private static string TagFor(PlayerState? state, DateTimeOffset now) => state switch
    {
        null => "",
        { Role: Role.Owner } => "[OWNER]",
        { Role: Role.HeadAdmin or Role.Admin } => "[ADMIN]",
        { Role: Role.Moderator } => "[MOD]",
        { Role: Role.Helper } => "[HELPER]",
        _ when state.IsVip(now) => $"[VIP · Lv {state.Level}]",
        _ => $"[Lv {state.Level}]",
    };

    private static char TagColor(PlayerState? state, DateTimeOffset now) => state switch
    {
        null => ChatColors.Grey,
        { Role: Role.Owner } => ChatColors.Red,
        { Role: >= Role.Admin } => ChatColors.LightRed,
        { Role: Role.Moderator or Role.Helper } => ChatColors.Lime,
        _ when state.IsVip(now) => ChatColors.Gold,
        _ => ChatColors.Grey,
    };
}
