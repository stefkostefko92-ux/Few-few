using System.Drawing;
using System.Text.Json;
using CarbonStealth.Logic;
using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Core.Translations;
using CounterStrikeSharp.API.Modules.Commands;
using CounterStrikeSharp.API.Modules.UserMessages;
using CounterStrikeSharp.API.Modules.Utils;
using CounterStrikeSharp.API.Modules.Timers;

namespace CarbonStealth;

/// <summary>
/// „Тежката артилерия“ на админите: slap, freeze, respawn, bring/goto, noclip, обявление в центъра,
/// чат само за екипа. Всичко минава през правата (§1), immunity и одита.
/// </summary>
public sealed partial class CarbonStealthPlugin
{
    private static readonly Color FrozenColor = Color.FromArgb(255, 80, 200, 255);
    private static readonly Color NormalColor = Color.FromArgb(255, 255, 255, 255);

    private void RegisterFunCommands()
    {
        AddCommand("css_slap", "Slap a player", (p, i) => FunCommand(p, i, AdminAction.Fun,
            (a, t) => Slap(a, t, i.ArgCount > 2 && int.TryParse(i.GetArg(2), out var d) ? Math.Clamp(d, 0, 100) : 0)));
        AddCommand("css_freeze", "Freeze a player", (p, i) => FunCommand(p, i, AdminAction.Fun,
            (a, t) => Freeze(a, t, i.ArgCount > 2 && int.TryParse(i.GetArg(2), out var s) ? Math.Clamp(s, 1, 60) : 5)));
        AddCommand("css_unfreeze", "Unfreeze a player", (p, i) => FunCommand(p, i, AdminAction.Fun, Unfreeze));
        AddCommand("css_respawn", "Respawn a player", (p, i) => FunCommand(p, i, AdminAction.Fun, RespawnPlayer));
        AddCommand("css_bring", "Teleport a player to you", (p, i) => FunCommand(p, i, AdminAction.Teleport, Bring));
        AddCommand("css_goto", "Teleport to a player", (p, i) => FunCommand(p, i, AdminAction.Teleport, Goto));
        AddCommand("css_noclip", "Noclip for yourself", (p, _) => ToggleNoclip(p));
        AddCommand("css_csay", "Announcement in the centre of the screen", (p, i) => CmdCsay(p, i));
        AddCommand("css_asay", "Message to the staff only", (p, i) => CmdAsay(p, i));
    }

    private void FunCommand(CCSPlayerController? actor, CommandInfo info, AdminAction action,
        Action<CCSPlayerController, CCSPlayerController> run)
    {
        if (actor is null || info.ArgCount < 2) { Tell(SlotOf(actor), "usage.fun", info.GetArg(0).Replace("css_", "", StringComparison.Ordinal)); return; }
        if (FunTarget(actor, info.GetArg(1), action) is { } target) run(actor, target);
    }

    /// <summary>Права + immunity. Върху себе си „забавните“ действия са позволени (напр. respawn).</summary>
    private CCSPlayerController? FunTarget(CCSPlayerController actor, string pattern, AdminAction action)
    {
        if (!Roles.Can(ActorRole(actor), action)) { Tell(actor.Slot, "no.permission"); return null; }
        var target = FindTarget(actor, pattern);
        if (target is null) return null;
        if (target.Slot != actor.Slot && _players.BySlot(target.Slot) is { } s && !Roles.CanTarget(ActorRole(actor), s.Role))
        {
            Tell(actor.Slot, "immune");
            return null;
        }
        return target;
    }

    private void Slap(CCSPlayerController? actor, CCSPlayerController target, int damage)
    {
        if (target.PlayerPawn.Value is not { IsValid: true } pawn || !target.PawnIsAlive) return;
        var rnd = Random.Shared;
        var v = pawn.AbsVelocity;
        pawn.Teleport(null, null, new Vector(
            v.X + (rnd.Next(180) + 50) * (rnd.Next(2) == 0 ? -1 : 1),
            v.Y + (rnd.Next(180) + 50) * (rnd.Next(2) == 0 ? -1 : 1),
            v.Z + rnd.Next(200) + 250));
        Shake(target, 1.2f, 14f);
        if (damage > 0)
        {
            pawn.Health -= damage;
            Utilities.SetStateChanged(pawn, "CBaseEntity", "m_iHealth");
            if (pawn.Health <= 0) pawn.CommitSuicide(true, true);
        }
        FunDone(actor, target, "fun.slapped", "player.slap", new { damage }, damage);
    }

    private void Freeze(CCSPlayerController? actor, CCSPlayerController target, int seconds)
    {
        if (target.PlayerPawn.Value is not { IsValid: true } pawn || !target.PawnIsAlive) return;
        SetMoveType(pawn, MoveType_t.MOVETYPE_OBSOLETE);
        Colorize(pawn, FrozenColor);
        Shake(target, 0.6f, 6f);
        var handle = pawn.EntityHandle.Raw;
        AddTimer(seconds, () =>
        {
            if (new CHandle<CBasePlayerPawn>(handle).Value is { IsValid: true } p && p.MoveType == MoveType_t.MOVETYPE_OBSOLETE)
            {
                SetMoveType(p, MoveType_t.MOVETYPE_WALK);
                Colorize(p, NormalColor);
            }
        }, TimerFlags.STOP_ON_MAPCHANGE);
        FunDone(actor, target, "fun.frozen", "player.freeze", new { seconds }, seconds);
    }

    private void Unfreeze(CCSPlayerController? actor, CCSPlayerController target)
    {
        if (target.PlayerPawn.Value is not { IsValid: true } pawn) return;
        SetMoveType(pawn, MoveType_t.MOVETYPE_WALK);
        Colorize(pawn, NormalColor);
        FunDone(actor, target, "fun.unfrozen", "player.unfreeze", new { });
    }

    private void RespawnPlayer(CCSPlayerController? actor, CCSPlayerController target)
    {
        if (target.PawnIsAlive || target.Team is not (CsTeam.Terrorist or CsTeam.CounterTerrorist)) return;
        target.Respawn();
        FunDone(actor, target, "fun.respawned", "player.respawn", new { });
    }

    private void Bring(CCSPlayerController actor, CCSPlayerController target) =>
        TeleportTo(actor, target, actor, "fun.bring", "player.bring");

    private void Goto(CCSPlayerController actor, CCSPlayerController target) =>
        TeleportTo(actor, actor, target, "fun.goto", "player.goto");

    private void TeleportTo(CCSPlayerController actor, CCSPlayerController who, CCSPlayerController where, string key, string audit)
    {
        if (who.PlayerPawn.Value is not { IsValid: true } a || where.PlayerPawn.Value is not { IsValid: true } b
            || !who.PawnIsAlive || !where.PawnIsAlive || b.AbsOrigin is not { } origin) return;
        // Малко встрани и нагоре, за да не се заклещат един в друг.
        a.Teleport(new Vector(origin.X + 40, origin.Y, origin.Z + 10), b.AbsRotation, new Vector(0, 0, 0));
        FunDone(actor, actor.Slot == who.Slot ? where : who, key, audit, new { });
    }

    private void ToggleNoclip(CCSPlayerController? actor)
    {
        if (actor is null) return;
        if (!Roles.Can(ActorRole(actor), AdminAction.Noclip)) { Tell(actor.Slot, "no.permission"); return; }
        if (actor.PlayerPawn.Value is not { IsValid: true } pawn || !actor.PawnIsAlive) return;
        var on = pawn.MoveType != MoveType_t.MOVETYPE_NOCLIP;
        SetMoveType(pawn, on ? MoveType_t.MOVETYPE_NOCLIP : MoveType_t.MOVETYPE_WALK);
        // Ако менюто е отворено, при затваряне връща именно това движение.
        if (_huds.TryGetValue(actor.Slot, out var hud) && hud.Frozen is { } f) hud.Frozen = (f.Pawn, pawn.MoveType);
        Tell(actor.Slot, on ? "fun.noclip.on" : "fun.noclip.off");
        Audit(actor, "player.noclip", null, new { on });
    }

    private void CmdCsay(CCSPlayerController? actor, CommandInfo info)
    {
        if (!Roles.Can(ActorRole(actor), AdminAction.Announce)) { Tell(SlotOf(actor), "no.permission"); return; }
        var text = Rest(info, 1);
        if (text.Length == 0) { Tell(SlotOf(actor), "usage.csay"); return; }
        Announce(actor, text);
    }

    /// <summary>Голям надпис в центъра за всички + ред в чата (центърът изчезва след 6 s).</summary>
    private void Announce(CCSPlayerController? actor, string text)
    {
        var html = $"<font color='{HudMenuRenderer.Gold}' class='fontSize-l'><b>{HudMenuRenderer.Escape(text)}</b></font>"
                   + $"<br><font color='{HudMenuRenderer.Muted}'>— {HudMenuRenderer.Escape(ActorName(actor))}</font>";
        foreach (var p in Utilities.GetPlayers().Where(p => p is { IsValid: true, IsBot: false }))
        {
            if (!_huds.ContainsKey(p.Slot)) p.PrintToCenterHtml(html, 6);
            p.PrintToChat(Localizer.ForPlayer(p, "admin.say", text));
        }
        Audit(actor, "server.announce", null, new { text });
    }

    private void CmdAsay(CCSPlayerController? actor, CommandInfo info)
    {
        if (ActorRole(actor) < Role.Helper) { Tell(SlotOf(actor), "no.permission"); return; }
        var text = Rest(info, 1);
        if (text.Length == 0) { Tell(SlotOf(actor), "usage.asay"); return; }
        var from = ActorName(actor);
        foreach (var p in Utilities.GetPlayers().Where(p => p is { IsValid: true, IsBot: false }))
        {
            if (_players.BySlot(p.Slot) is { Role: >= Role.Helper }) p.PrintToChat(Localizer.ForPlayer(p, "asay", from, text));
        }
    }

    private void FunDone(CCSPlayerController? actor, CCSPlayerController target, string key, string audit, object details, object? extra = null)
    {
        var targetName = _players.BySlot(target.Slot)?.Name ?? Text.SafeName(target.PlayerName);
        var actorName = ActorName(actor);
        Broadcast(key, actorName, targetName, extra ?? "");
        Audit(actor, audit, _players.BySlot(target.Slot)?.SteamId64, details);
    }

    private void Audit(CCSPlayerController? actor, string action, string? target, object details)
    {
        if (_db is not { } db) return;
        var actorId = ActorId(actor);
        var json = JsonSerializer.Serialize(details);
        RunDb(() => db.AuditAsync(actorId, action, target, json), "audit");
    }

    private static void Shake(CCSPlayerController player, float duration, float amplitude)
    {
        var msg = UserMessage.FromPartialName("Shake");
        msg.SetFloat("duration", duration);
        msg.SetFloat("amplitude", amplitude);
        msg.SetFloat("frequency", 1f);
        msg.SetInt("command", 0);
        msg.Recipients.Add(player);
        msg.Send();
    }

    private static void Colorize(CBasePlayerPawn pawn, Color color)
    {
        pawn.Render = color;
        Utilities.SetStateChanged(pawn, "CBaseModelEntity", "m_clrRender");
    }
}
