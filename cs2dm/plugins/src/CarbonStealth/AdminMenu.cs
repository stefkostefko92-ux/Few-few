using System.Globalization;
using CarbonStealth.Logic;
using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;

namespace CarbonStealth;

/// <summary>
/// !admin — WASD меню в центъра: начало → играчи → действие → срок/причина → потвърждение.
/// Показва само действията, които ролята позволява; immunity се вижда като заключен ред.
/// Изпълнението минава през същите методи като чат командите (права, одит, мост).
/// </summary>
public sealed partial class CarbonStealthPlugin
{
    private static readonly string[] BanDurations = ["30m", "2h", "1d", "7d", "30d", "0"];
    private static readonly string[] TimedDurations = ["10m", "30m", "2h", "1d", "7d", "0"];
    private static readonly string[] MenuCategories = ["CHEATING", "TOXICITY", "EXPLOIT", "SPAM", "IMPERSONATION", "OTHER"];
    private static readonly string[] ReasonKeys = ["hud.reason.cheat", "hud.reason.toxic", "hud.reason.afk", "hud.reason.spam", "hud.reason.none"];

    private void OpenAdminMenu(CCSPlayerController? actor)
    {
        if (actor is null) { Tell(null, "menu.ingame"); return; }
        if (!Roles.Can(ActorRole(actor), AdminAction.Menu)) { Tell(actor.Slot, "no.permission"); return; }
        var slot = actor.Slot;
        OpenHud(actor, () => RootPage(slot));
    }

    private HudMenuSession? Hud(int slot) => _huds.TryGetValue(slot, out var h) ? h.Session : null;

    private void Push(int slot, Func<HudPage> page) => Hud(slot)?.Push(page);

    private HudPage RootPage(int slot)
    {
        var me = Utilities.GetPlayerFromSlot(slot);
        var role = ActorRole(me);
        var humans = Utilities.GetPlayers().Count(p => p is { IsValid: true, IsBot: false });
        var bots = Utilities.GetPlayers().Count(p => p is { IsValid: true, IsBot: true });
        var items = new List<HudItem>
        {
            new(L(slot, "hud.players"), () => Push(slot, () => PlayersPage(slot)), Detail: $"{humans} + {bots} bots"),
        };
        if (Roles.Can(role, AdminAction.Server)) items.Add(new(L(slot, "hud.server"), () => Push(slot, () => ServerPage(slot)), Detail: CurrentModeName()));
        if (Roles.Can(role, AdminAction.Announce)) items.Add(new(L(slot, "hud.announce"), () => Push(slot, () => AnnouncePage(slot))));
        if (Roles.Can(role, AdminAction.Banners)) items.Add(new(L(slot, "hud.banners"), () => Push(slot, () => BannersPage(slot)), Detail: _banners.Count.ToString(CultureInfo.InvariantCulture)));
        if (Roles.Can(role, AdminAction.Noclip))
        {
            var noclip = me?.PlayerPawn.Value is { IsValid: true } pw && _huds.TryGetValue(slot, out var h)
                && (h.Frozen?.Was ?? pw.MoveType) == MoveType_t.MOVETYPE_NOCLIP;
            // Затваря менюто: в noclip летиш с WASD веднага (докато менюто е отворено, стоиш на място).
            items.Add(new(L(slot, "hud.noclip"), () =>
            {
                CloseHud(slot);
                ToggleNoclip(Utilities.GetPlayerFromSlot(slot));
            }, Detail: L(slot, noclip ? "hud.on" : "hud.off")));
        }
        items.Add(new(L(slot, "hud.close"), () => CloseHud(slot)));
        var name = _players.BySlot(slot)?.Name ?? "";
        return new HudPage(L(slot, "hud.root"), $"[{role.ToString().ToUpperInvariant()}] {name} · {humans}/{Server.MaxPlayers}", items);
    }

    private HudPage PlayersPage(int slot)
    {
        var role = ActorRole(Utilities.GetPlayerFromSlot(slot));
        var items = new List<HudItem>();
        foreach (var p in Utilities.GetPlayers().Where(p => p is { IsValid: true, IsBot: false }).OrderBy(p => p.PlayerName, StringComparer.OrdinalIgnoreCase))
        {
            if (_players.BySlot(p.Slot) is not { } s || p.UserId is not { } uid) continue;
            var immune = p.Slot != slot && !Roles.CanTarget(role, s.Role);
            var detail = $"Lv {s.Level} · {s.SessionKills}/{s.SessionDeaths}" + (immune ? $" · {L(slot, "hud.immune")}" : "");
            items.Add(new HudItem(s.Name, () => Push(slot, () => PlayerPage(slot, uid, s.SteamId)), Detail: detail,
                Tone: s.Role >= Role.Helper ? HudTone.Good : HudTone.Normal));
        }
        if (items.Count == 0) items.Add(new HudItem(L(slot, "hud.nobody"), null, Disabled: true));
        return new HudPage(L(slot, "hud.players"), $"{items.Count(i => i.OnSelect is not null)} online", items);
    }

    /// <summary>Действия върху играч. Целта се търси наново по userid + SteamID (може да е излязъл).</summary>
    private HudPage PlayerPage(int slot, int uid, ulong steamId)
    {
        var target = Utilities.GetPlayers().FirstOrDefault(p => p is { IsValid: true } && p.UserId == uid);
        var state = target is null ? null : _players.BySlot(target.Slot);
        if (target is null || state is null || state.SteamId != steamId)
        {
            return new HudPage(L(slot, "hud.players"), L(slot, "hud.gone"), [new HudItem(L(slot, "hud.back"), () => Hud(slot)?.Back())]);
        }
        var role = ActorRole(Utilities.GetPlayerFromSlot(slot));
        var self = target.Slot == slot;
        var locked = !self && !Roles.CanTarget(role, state.Role);
        var hp = target.PlayerPawn.Value is { IsValid: true } pawn && target.PawnIsAlive ? pawn.Health.ToString(CultureInfo.InvariantCulture) : L(slot, "hud.dead");
        var sub = $"[{state.Role.ToString().ToUpperInvariant()}] Lv {state.Level} · {state.SessionKills}/{state.SessionDeaths} · HP {hp} · {target.Ping} ms";
        var pattern = $"#{uid}";
        var items = new List<HudItem>();

        void Add(AdminAction action, string key, Action run, HudTone tone = HudTone.Normal, string? detail = null, bool allowSelf = false)
        {
            if (!Roles.Can(role, action)) return;
            var disabled = locked || (self && !allowSelf);
            items.Add(new HudItem(L(slot, key), disabled ? null : run, tone, detail, disabled));
        }

        CCSPlayerController? Me() => Utilities.GetPlayerFromSlot(slot);
        CCSPlayerController? T() => Utilities.GetPlayers().FirstOrDefault(p => p is { IsValid: true } && p.UserId == uid);

        Add(AdminAction.Slay, "hud.slay", () => { SlayTarget(Me(), pattern); Hud(slot)?.Home(); }, HudTone.Danger);
        Add(AdminAction.Fun, "hud.slap", () => Push(slot, () => SlapPage(slot, uid)), allowSelf: true);
        Add(AdminAction.Fun, "hud.freeze", () => { if (T() is { } t) Freeze(Me(), t, 5); }, detail: "5 s");
        Add(AdminAction.Fun, "hud.unfreeze", () => { if (T() is { } t) Unfreeze(Me(), t); }, HudTone.Good, allowSelf: true);
        Add(AdminAction.Fun, "hud.respawn", () => { if (T() is { } t) RespawnPlayer(Me(), t); }, HudTone.Good, allowSelf: true);
        Add(AdminAction.Teleport, "hud.bring", () => { if (Me() is { } m && T() is { } t) Bring(m, t); });
        Add(AdminAction.Teleport, "hud.goto", () => { if (Me() is { } m && T() is { } t) Goto(m, t); });
        Add(AdminAction.Kick, "hud.kick", () => Push(slot, () => ReasonPage(slot, "hud.kick", r => KickTarget(Me(), pattern, r))), HudTone.Danger);
        Add(AdminAction.Mute, "hud.mute", () => Push(slot, () => DurationPage(slot, "hud.mute", TimedDurations, false,
            d => Timed(Me(), pattern, "MUTE", AdminAction.Mute, d, ""))));
        Add(AdminAction.Gag, "hud.gag", () => Push(slot, () => DurationPage(slot, "hud.gag", TimedDurations, false,
            d => Timed(Me(), pattern, "GAG", AdminAction.Gag, d, ""))));
        Add(AdminAction.Silence, "hud.silence", () => Push(slot, () => DurationPage(slot, "hud.silence", TimedDurations, false,
            d => Timed(Me(), pattern, "SILENCE", AdminAction.Silence, d, ""))));
        Add(AdminAction.BanTemporary, "hud.ban", () => Push(slot, () => DurationPage(slot, "hud.ban", BanDurations, true,
            d => Push(slot, () => CategoryPage(slot, c => Push(slot, () => ConfirmPage(slot, L(slot, "hud.ban"),
                $"{state.Name} · {(d is null ? L(slot, "permanent") : Durations.Describe(d))} · {L(slot, $"category.{c}")}",
                () => Ban(Me(), pattern, d, c, ""))))))), HudTone.Danger);
        Add(AdminAction.Warn, "hud.warn", () => Push(slot, () => ReasonPage(slot, "hud.warn", r => WarnTarget(Me(), pattern, r))));
        items.Add(new HudItem(L(slot, "hud.back"), () => Hud(slot)?.Back()));
        return new HudPage(state.Name, sub, items);
    }
}
