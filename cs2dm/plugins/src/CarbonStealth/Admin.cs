using CarbonStealth.Logic;
using CarbonStealth.State;
using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Core.Translations;
using CounterStrikeSharp.API.Modules.Commands;

namespace CarbonStealth;

public sealed partial class CarbonStealthPlugin
{
    private static readonly Dictionary<string, string> Categories = new(StringComparer.OrdinalIgnoreCase)
    {
        ["cheating"] = "CHEATING", ["cheat"] = "CHEATING", ["toxicity"] = "TOXICITY", ["toxic"] = "TOXICITY",
        ["exploit"] = "EXPLOIT", ["spam"] = "SPAM", ["impersonation"] = "IMPERSONATION", ["other"] = "OTHER",
    };

    private void RegisterAdminCommands()
    {
        AddCommand("css_admin", "Admin menu", (p, i) => OpenAdminMenu(p));
        AddCommand("css_kick", "Kick a player", (p, i) => CmdKick(p, i));
        AddCommand("css_ban", "Ban a player", (p, i) => CmdBan(p, i));
        AddCommand("css_mute", "Mute voice", (p, i) => CmdTimed(p, i, "MUTE", "mute", AdminAction.Mute));
        AddCommand("css_gag", "Block chat", (p, i) => CmdTimed(p, i, "GAG", "gag", AdminAction.Gag));
        AddCommand("css_silence", "Block voice and chat", (p, i) => CmdTimed(p, i, "SILENCE", "silence", AdminAction.Silence));
        AddCommand("css_unmute", "Lift mute", (p, i) => CmdRevoke(p, i, ["MUTE", "SILENCE"], "unmute"));
        AddCommand("css_ungag", "Lift gag", (p, i) => CmdRevoke(p, i, ["GAG", "SILENCE"], "ungag"));
        AddCommand("css_unban", "Lift a ban by SteamID64", (p, i) => CmdUnban(p, i));
        AddCommand("css_warn", "Warn a player", (p, i) => CmdWarn(p, i));
        AddCommand("css_slay", "Slay a player", (p, i) => CmdSlay(p, i));
        AddCommand("css_report", "Report a player to the admins", (p, i) => CmdReport(p, i));
        AddCommand("css_rank", "Your level and XP", (p, i) => CmdRank(p));
        AddCommand("css_banner", "Place in-map banners", (p, i) => CmdBanner(p, i));
    }

    /// <summary>Роля на изпълняващия: конзолата на сървъра е собственик.</summary>
    private Role ActorRole(CCSPlayerController? actor) =>
        actor is null ? Role.Owner : _players.BySlot(actor.Slot)?.Role ?? Role.Player;

    private string ActorName(CCSPlayerController? actor) =>
        actor is null ? "Console" : _players.BySlot(actor.Slot)?.Name ?? Text.SafeName(actor.PlayerName);

    private string? ActorId(CCSPlayerController? actor) => actor is null ? null : _players.BySlot(actor.Slot)?.SteamId64;

    /// <summary>
    /// Отговор до изпълнилия командата. По слот, НЕ през CommandInfo: той е native обект, валиден само
    /// докато трае командата, а отговорите често идват след асинхронна работа с базата.
    /// </summary>
    private void Tell(int? slot, string key, params object[] args)
    {
        if (slot is null)
        {
            Server.PrintToConsole($"[CarbonStealth] {Localizer[key, args]}");
            return;
        }
        if (Utilities.GetPlayerFromSlot(slot.Value) is { IsValid: true } p) p.PrintToChat(Localizer.ForPlayer(p, key, args));
    }

    private static int? SlotOf(CCSPlayerController? actor) => actor?.Slot;

    /// <summary>Права + immunity + заредени данни. null = отказано (вече е отговорено).</summary>
    private (CCSPlayerController Target, PlayerState State)? Authorize(CCSPlayerController? actor,
        string pattern, AdminAction action)
    {
        if (actor is not null && _players.BySlot(actor.Slot) is not { Loaded: true })
        {
            Tell(SlotOf(actor), "not.ready");
            return null;
        }
        var role = ActorRole(actor);
        if (!Roles.Can(role, action))
        {
            Tell(SlotOf(actor), "no.permission");
            return null;
        }
        var target = FindTarget(actor, pattern);
        if (target is null) return null;
        var state = _players.BySlot(target.Slot);
        if (state is not { Loaded: true })
        {
            Tell(SlotOf(actor), "not.ready");
            return null;
        }
        if (!Roles.CanTarget(role, state.Role))
        {
            Tell(SlotOf(actor), "immune");
            return null;
        }
        return (target, state);
    }

    /// <summary>„#userid“, SteamID64 или част от името (само хора).</summary>
    private CCSPlayerController? FindTarget(CCSPlayerController? actor, string pattern)
    {
        var humans = Utilities.GetPlayers().Where(p => p is { IsValid: true, IsBot: false }).ToList();
        List<CCSPlayerController> found;
        if (pattern.StartsWith('#') && int.TryParse(pattern[1..], out var uid)) found = humans.Where(p => p.UserId == uid).ToList();
        else if (Text.IsSteamId64(pattern)) found = humans.Where(p => p.SteamID.ToString() == pattern).ToList();
        else
        {
            found = humans.Where(p => p.PlayerName.Equals(pattern, StringComparison.OrdinalIgnoreCase)).ToList();
            if (found.Count == 0) found = humans.Where(p => p.PlayerName.Contains(pattern, StringComparison.OrdinalIgnoreCase)).ToList();
        }
        if (found.Count == 1) return found[0];
        Tell(SlotOf(actor), found.Count == 0 ? "target.notfound" : "target.ambiguous", Text.SafeText(pattern, 32));
        return null;
    }

    private static string Rest(CommandInfo info, int from) =>
        Text.SafeText(string.Join(' ', Enumerable.Range(from, Math.Max(0, info.ArgCount - from)).Select(info.GetArg)), 200);

    private void CmdKick(CCSPlayerController? actor, CommandInfo info)
    {
        if (info.ArgCount < 2) { Tell(SlotOf(actor), "usage.target", "kick"); return; }
        KickTarget(actor, info.GetArg(1), Rest(info, 2));
    }

    private void KickTarget(CCSPlayerController? actor, string pattern, string reason)
    {
        if (Authorize(actor, pattern, AdminAction.Kick) is not { } t) return;
        var actorName = ActorName(actor);
        var targetSlot = t.State.Slot;
        Record("KICK", t.State, "OTHER", reason, DateTimeOffset.UtcNow, actor, () =>
        {
            Broadcast("admin.kicked", t.State.Name, actorName);
            if (Utilities.GetPlayerFromSlot(targetSlot) is { IsValid: true } target && _players.BySlot(targetSlot) == t.State)
            {
                Kick(target, reason.Length > 0 ? reason : "Kicked by an admin");
            }
        });
    }

    private void CmdBan(CCSPlayerController? actor, CommandInfo info)
    {
        if (info.ArgCount < 4 || !Durations.TryParse(info.GetArg(2), out var duration)
            || !Categories.TryGetValue(info.GetArg(3), out var category))
        {
            Tell(SlotOf(actor), "usage.ban");
            return;
        }
        Ban(actor, info.GetArg(1), duration, category, Rest(info, 4));
    }

    private void Ban(CCSPlayerController? actor, string pattern, TimeSpan? duration, string category, string reason)
    {
        if (Authorize(actor, pattern, Roles.BanAction(duration)) is not { } t) return;
        var expires = duration is { } d ? DateTimeOffset.UtcNow + d : (DateTimeOffset?)null;
        var actorName = ActorName(actor);
        var targetSlot = t.State.Slot;
        Record("BAN", t.State, category, reason, expires, actor, () =>
        {
            Broadcast(p => Localizer.ForPlayer(p, "admin.banned", t.State.Name, actorName,
                Localizer.ForPlayer(p, $"category.{category}"), Durations.Describe(duration)));
            if (Utilities.GetPlayerFromSlot(targetSlot) is { IsValid: true } target && _players.BySlot(targetSlot) == t.State)
            {
                Kick(target, Localizer.ForPlayer(target, "banned", Localizer.ForPlayer(target, $"category.{category}"),
                    When(target, expires), $"{Config.SiteUrl}/bans"));
            }
        });
    }

    private void CmdTimed(CCSPlayerController? actor, CommandInfo info, string type, string command, AdminAction action)
    {
        if (info.ArgCount < 3 || !Durations.TryParse(info.GetArg(2), out var duration))
        {
            Tell(SlotOf(actor), "usage.timed", command);
            return;
        }
        Timed(actor, info.GetArg(1), type, action, duration, Rest(info, 3));
    }

    private void Timed(CCSPlayerController? actor, string pattern, string type, AdminAction action, TimeSpan? duration, string reason)
    {
        if (Authorize(actor, pattern, action) is not { } t) return;
        var expires = duration is { } d ? DateTimeOffset.UtcNow + d : (DateTimeOffset?)null;
        var actorName = ActorName(actor);
        Record(type, t.State, "OTHER", reason, expires, actor, id =>
        {
            t.State.Punishments.Add(new ActivePunishment(id, type, "OTHER", expires));
            if (Utilities.GetPlayerFromSlot(t.State.Slot) is { IsValid: true } target) ApplyVoice(target, t.State, DateTimeOffset.UtcNow);
            Broadcast($"admin.{type}", t.State.Name, actorName, Durations.Describe(duration));
        });
    }

    private void CmdRevoke(CCSPlayerController? actor, CommandInfo info, string[] types, string command)
    {
        if (info.ArgCount < 2) { Tell(SlotOf(actor), "usage.target", command); return; }
        var action = types.Contains("MUTE") ? AdminAction.Mute : AdminAction.Gag;
        if (Authorize(actor, info.GetArg(1), action) is not { } t || _db is not { } db) return;
        var reason = Rest(info, 2);
        var slot = SlotOf(actor);
        var actorName = ActorName(actor);
        RunDb(() => db.RevokeAsync(t.State.SteamId64, types, ActorId(actor), reason), _ =>
        {
            t.State.Punishments.RemoveAll(p => types.Contains(p.Type));
            if (Utilities.GetPlayerFromSlot(t.State.Slot) is { IsValid: true } target) ApplyVoice(target, t.State, DateTimeOffset.UtcNow);
            Broadcast("admin.revoked", t.State.Name, command, actorName);
        }, "revoke", () => Tell(slot, "db.error"));
    }

    private void CmdUnban(CCSPlayerController? actor, CommandInfo info)
    {
        if (info.ArgCount < 2 || !Text.IsSteamId64(info.GetArg(1))) { Tell(SlotOf(actor), "usage.unban"); return; }
        if (!Roles.Can(ActorRole(actor), AdminAction.Unban)) { Tell(SlotOf(actor), "no.permission"); return; }
        if (_db is not { } db) return;
        var steamId = info.GetArg(1);
        var reason = Rest(info, 2);
        var slot = SlotOf(actor);
        RunDb(() => db.RevokeAsync(steamId, ["BAN"], ActorId(actor), reason),
            count => Tell(slot, "admin.unbanned", steamId, count), "unban", () => Tell(slot, "db.error"));
    }

    private void CmdWarn(CCSPlayerController? actor, CommandInfo info)
    {
        if (info.ArgCount < 3) { Tell(SlotOf(actor), "usage.target", "warn"); return; }
        WarnTarget(actor, info.GetArg(1), Rest(info, 2));
    }

    private void WarnTarget(CCSPlayerController? actor, string pattern, string reason)
    {
        if (Authorize(actor, pattern, AdminAction.Warn) is not { } t) return;
        var actorName = ActorName(actor);
        Record("WARN", t.State, "OTHER", reason, DateTimeOffset.UtcNow, actor,
            () => Broadcast("admin.warned", t.State.Name, actorName, reason));
    }

    private void CmdSlay(CCSPlayerController? actor, CommandInfo info)
    {
        if (info.ArgCount < 2) { Tell(SlotOf(actor), "usage.target", "slay"); return; }
        SlayTarget(actor, info.GetArg(1));
    }

    private void SlayTarget(CCSPlayerController? actor, string pattern)
    {
        if (Authorize(actor, pattern, AdminAction.Slay) is not { } t) return;
        t.Target.PlayerPawn.Value?.CommitSuicide(false, true);
        Broadcast("admin.slayed", t.State.Name, ActorName(actor));
        if (_db is { } db) RunDb(() => db.AuditAsync(ActorId(actor), "player.slay", t.State.SteamId64, "{}"), "audit");
    }

    private void CmdReport(CCSPlayerController? actor, CommandInfo info)
    {
        if (actor is null || info.ArgCount < 3) { Tell(SlotOf(actor), "usage.report"); return; }
        var me = _players.BySlot(actor.Slot);
        var now = DateTimeOffset.UtcNow;
        if (me is null || now - me.LastReportAt < TimeSpan.FromSeconds(60) || _db is not { } db) return;
        var target = FindTarget(actor, info.GetArg(1));
        if (target is null || _players.BySlot(target.Slot) is not { } t) return;
        me.LastReportAt = now;
        var reason = Rest(info, 2);
        var slot = actor.Slot;
        RunDb(() => db.ReportAsync(me.SteamId64, t.SteamId64, t.Name, reason), "report", onDone: () =>
        {
            Tell(slot, "report.sent");
            _bridge?.Event("report", new { reporter = me.SteamId64, target = t.SteamId64, targetName = t.Name, reason });
        });
    }

    private void CmdRank(CCSPlayerController? actor)
    {
        if (actor is null || _players.BySlot(actor.Slot) is not { Loaded: true } s) return;
        var next = Progression.XpForLevel(s.Level + 1) - s.Xp;
        actor.PrintToChat(Localizer.ForPlayer(actor, "rank", s.Level, s.Xp, next, $"{Config.SiteUrl}/player/{s.SteamId64}"));
    }

    /// <summary>Записва наказание (с одит) и след успех изпълнява действието в играта.</summary>
    private void Record(string type, PlayerState target, string category, string reason, DateTimeOffset? expires,
        CCSPlayerController? actor, Action<int> onSaved)
    {
        if (_db is not { } db) return;
        var actorId = ActorId(actor);
        var actorSlot = SlotOf(actor);
        RunDb(() => db.PunishAsync(type, target.SteamId64, target.Name, category,
                reason.Length > 0 ? reason : "-", expires, actorId),
            id =>
            {
                onSaved(id);
                _bridge?.Event("admin", new { actor = actorId, action = type, target = target.SteamId64, punishmentId = id });
            }, $"punish {type}",
            () => Tell(actorSlot, "db.error"));
    }

    private void Record(string type, PlayerState target, string category, string reason, DateTimeOffset? expires,
        CCSPlayerController? actor, Action onSaved) =>
        Record(type, target, category, reason, expires, actor, _ => onSaved());
}
