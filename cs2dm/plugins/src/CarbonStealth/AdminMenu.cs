using CarbonStealth.Logic;
using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Core.Translations;
using CounterStrikeSharp.API.Modules.Menu;

namespace CarbonStealth;

/// <summary>
/// !admin — чат меню: действие → играч → продължителност → категория. Само действията, които ролята
/// позволява; изпълнението минава през същите проверки като командите (права, immunity, одит).
/// </summary>
public sealed partial class CarbonStealthPlugin
{
    private static readonly string[] BanDurations = ["30m", "2h", "1d", "7d", "30d", "0"];
    private static readonly string[] TimedDurations = ["10m", "30m", "2h", "1d", "7d", "0"];
    private static readonly string[] MenuCategories = ["CHEATING", "TOXICITY", "EXPLOIT", "SPAM", "IMPERSONATION", "OTHER"];

    private void OpenAdminMenu(CCSPlayerController? actor)
    {
        if (actor is null) { Tell(null, "menu.ingame"); return; }
        var role = ActorRole(actor);
        if (!Roles.Can(role, AdminAction.Menu)) { Tell(actor.Slot, "no.permission"); return; }

        var menu = new ChatMenu(Localizer.ForPlayer(actor, "menu.admin"));
        void Add(string key, AdminAction action, Action<CCSPlayerController> next)
        {
            if (Roles.Can(role, action)) menu.AddMenuOption(Localizer.ForPlayer(actor, key), (p, _) => next(p));
        }
        Add("action.kick", AdminAction.Kick, p => PickTarget(p, AdminAction.Kick, (a, t) => KickTarget(a, t, "")));
        Add("action.ban", AdminAction.BanTemporary, p => PickTarget(p, AdminAction.BanTemporary, (a, t) =>
            PickDuration(a, BanDurations, d => PickCategory(a, c => Ban(a, t, d, c, "")))));
        Add("action.mute", AdminAction.Mute, p => PickTimed(p, "MUTE", AdminAction.Mute));
        Add("action.gag", AdminAction.Gag, p => PickTimed(p, "GAG", AdminAction.Gag));
        Add("action.silence", AdminAction.Silence, p => PickTimed(p, "SILENCE", AdminAction.Silence));
        Add("action.slay", AdminAction.Slay, p => PickTarget(p, AdminAction.Slay, SlayTarget));
        MenuManager.OpenChatMenu(actor, menu);
    }

    private void PickTimed(CCSPlayerController actor, string type, AdminAction action) =>
        PickTarget(actor, action, (a, t) => PickDuration(a, TimedDurations, d => Timed(a, t, type, action, d, "")));

    /// <summary>Хората, които ролята може да наказва. Целта се подава като „#userid“ и се проверява наново.</summary>
    private void PickTarget(CCSPlayerController actor, AdminAction action, Action<CCSPlayerController, string> next)
    {
        var role = ActorRole(actor);
        var menu = new ChatMenu(Localizer.ForPlayer(actor, "menu.player"));
        foreach (var p in Utilities.GetPlayers().Where(p => p is { IsValid: true, IsBot: false } && p.Slot != actor.Slot))
        {
            if (_players.BySlot(p.Slot) is not { Loaded: true } s || !Roles.CanTarget(role, s.Role) || p.UserId is not { } uid) continue;
            menu.AddMenuOption($"{s.Name} (#{uid})", (a, _) => next(a, $"#{uid}"));
        }
        if (menu.MenuOptions.Count == 0) { Tell(actor.Slot, "menu.nobody"); return; }
        MenuManager.OpenChatMenu(actor, menu);
    }

    private void PickDuration(CCSPlayerController actor, string[] options, Action<TimeSpan?> next)
    {
        var role = ActorRole(actor);
        var menu = new ChatMenu(Localizer.ForPlayer(actor, "menu.duration"));
        foreach (var o in options)
        {
            if (!Durations.TryParse(o, out var d)) continue;
            // Модераторът вижда само това, което може да даде (бан до 7 дни).
            if (options == BanDurations && !Roles.Can(role, Roles.BanAction(d))) continue;
            var label = d is null ? Localizer.ForPlayer(actor, "permanent") : Durations.Describe(d);
            menu.AddMenuOption(label, (_, _) => next(d));
        }
        MenuManager.OpenChatMenu(actor, menu);
    }

    private void PickCategory(CCSPlayerController actor, Action<string> next)
    {
        var menu = new ChatMenu(Localizer.ForPlayer(actor, "menu.category"));
        foreach (var c in MenuCategories)
        {
            menu.AddMenuOption(Localizer.ForPlayer(actor, $"category.{c}"), (_, _) => next(c));
        }
        MenuManager.OpenChatMenu(actor, menu);
    }
}
