using CarbonStealth.Data;
using CarbonStealth.Logic;
using CarbonStealth.State;
using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Core.Translations;
using CounterStrikeSharp.API.Modules.Commands;
using CounterStrikeSharp.API.Modules.Timers;

namespace CarbonStealth;

/// <summary>
/// Дуелите във FFA (CONTRACT.md §15): !duel &lt;ник&gt; → !accept / !decline до 30 s; до 5 убийства един срещу
/// друг или 3 минути, само хора, по един дуел на човек, пауза 2 минути за двойката. Победителят взема +50 XP,
/// редът отива в `duels` (отменените — не). Излизане и смяна на картата слагат край. Останалите убийства
/// си текат нормално — дуелът е само брояч между двамата.
/// </summary>
public sealed partial class CarbonStealthPlugin
{
    private readonly DuelBook _duels = new();

    private void RegisterDuels()
    {
        AddCommand("css_duel", "Challenge a player to a duel (first to 5 kills)", (p, i) => CmdDuel(p, i));
        AddCommand("css_accept", "Accept a duel", (p, _) => CmdAcceptDuel(p));
        AddCommand("css_decline", "Decline a duel", (p, _) => CmdDeclineDuel(p));
        RegisterListener<Listeners.OnMapEnd>(() =>
        {
            foreach (var result in _duels.EndAll(DateTimeOffset.UtcNow)) FinishDuel(result);
        });
        // Основното OnClientDisconnect вече е махнало играча от регистъра — тук само проверяваме кой остава.
        RegisterListener<Listeners.OnClientDisconnect>(_ => Server.NextFrame(() =>
        {
            foreach (var result in _duels.SyncPresence(OnlineSteamIds(), DateTimeOffset.UtcNow)) FinishDuel(result);
        }));
        AddTimer(1f, TickDuels, TimerFlags.REPEAT);
    }

    private void CmdDuel(CCSPlayerController? actor, CommandInfo info)
    {
        if (actor is null) { Tell(null, "duel.ingame"); return; }
        if (_players.BySlot(actor.Slot) is not { Loaded: true } me) { Tell(actor.Slot, "not.ready"); return; }
        if (info.ArgCount < 2)
        {
            Tell(actor.Slot, "duel.usage", DuelRules.Target, DuelRules.DurationSeconds / 60);
            return;
        }
        var pattern = string.Join(' ', Enumerable.Range(1, info.ArgCount - 1).Select(info.GetArg));
        if (FindTarget(actor, pattern) is not { } target) return;
        if (_players.BySlot(target.Slot) is not { Loaded: true } them) { Tell(actor.Slot, "not.ready"); return; }
        var now = DateTimeOffset.UtcNow;
        switch (_duels.Invite(me.SteamId64, me.Name, them.SteamId64, them.Name, now))
        {
            case DuelInviteError.None:
                Tell(actor.Slot, "duel.sent", them.Name, DuelRules.InviteSeconds);
                target.PrintToChat(Localizer.ForPlayer(target, "duel.invite", me.Name, DuelRules.Target, DuelRules.InviteSeconds));
                CenterTo(target, Localizer.ForPlayer(target, "hud.duel.invite", me.Name));
                break;
            case DuelInviteError.Self:
                Tell(actor.Slot, "duel.self");
                break;
            case DuelInviteError.Busy:
                Tell(actor.Slot, "duel.busy");
                break;
            case DuelInviteError.TargetBusy:
                Tell(actor.Slot, "duel.targetBusy", them.Name);
                break;
            case DuelInviteError.Pending:
                Tell(actor.Slot, "duel.pending");
                break;
            case DuelInviteError.TargetPending:
                Tell(actor.Slot, "duel.targetPending", them.Name);
                break;
            case DuelInviteError.Cooldown:
                Tell(actor.Slot, "duel.cooldown", them.Name, _duels.CooldownLeft(me.SteamId64, them.SteamId64, now));
                break;
        }
    }

    private void CmdAcceptDuel(CCSPlayerController? actor)
    {
        if (actor is null || _players.BySlot(actor.Slot) is not { Loaded: true } me) return;
        if (_duels.Accept(me.SteamId64, DateTimeOffset.UtcNow) is not { } duel) { Tell(actor.Slot, "duel.noinvite"); return; }
        Broadcast("duel.started", duel.AName, duel.BName, DuelRules.Target, DuelRules.DurationSeconds / 60);
        foreach (var id in new[] { duel.A, duel.B })
        {
            if (PlayerOf(id) is { } p) CenterTo(p, Localizer.ForPlayer(p, "hud.duel.start", duel.NameOf(duel.Opponent(id)), DuelRules.Target));
        }
    }

    private void CmdDeclineDuel(CCSPlayerController? actor)
    {
        if (actor is null || _players.BySlot(actor.Slot) is not { Loaded: true } me) return;
        if (_duels.Decline(me.SteamId64, DateTimeOffset.UtcNow) is not { } invite) { Tell(actor.Slot, "duel.noinvite"); return; }
        Tell(actor.Slot, "duel.declinedYou", invite.FromName);
        if (PlayerOf(invite.From) is { } from) Tell(from.Slot, "duel.declined", me.Name);
    }

    private void TickDuels()
    {
        var now = DateTimeOffset.UtcNow;
        foreach (var invite in _duels.ExpireInvites(now))
        {
            if (PlayerOf(invite.From) is { } from) Tell(from.Slot, "duel.expired", invite.ToName);
        }
        foreach (var result in _duels.Tick(now)) FinishDuel(result);
    }

    /// <summary>Убийство между хора: ако са в един дуел — резултатът на двамата или краят.</summary>
    private void OnDuelKill(PlayerState attacker, PlayerState victim)
    {
        var (duel, result) = _duels.Kill(attacker.SteamId64, victim.SteamId64, DateTimeOffset.UtcNow);
        if (duel is null) return;
        if (result is not null)
        {
            FinishDuel(result);
            return;
        }
        foreach (var id in new[] { duel.A, duel.B })
        {
            if (PlayerOf(id) is { } p) Tell(p.Slot, "duel.score", duel.AName, duel.ScoreA, duel.ScoreB, duel.BName);
        }
    }

    private void FinishDuel(DuelResult r)
    {
        switch (r.Outcome)
        {
            case DuelOutcome.Cancelled:
                foreach (var id in new[] { r.WinnerId, r.LoserId })
                {
                    if (PlayerOf(id) is { } p) Tell(p.Slot, "duel.cancelled");
                }
                return;
            case DuelOutcome.Draw:
                Broadcast("duel.draw", r.WinnerName, r.LoserName, r.WinnerScore);
                break;
            default:
                Broadcast("duel.won", r.WinnerName, r.LoserName, r.WinnerScore, r.LoserScore, Progression.DuelWinXp);
                RewardDuel(r.WinnerId);
                break;
        }
        if (_db is { } db) RunDb(() => db.SaveDuelAsync(r), "duel save");
    }

    /// <summary>+50 XP наведнъж (без множител) — в партидата, в мача и с обява за ниво.</summary>
    private void RewardDuel(string steamId64)
    {
        if (PlayerOf(steamId64) is not { } p || _players.BySlot(p.Slot) is not { Loaded: true } s) return;
        var levelBefore = s.Level;
        s.Xp += Progression.DuelWinXp;
        Delta(s).Xp += Progression.DuelWinXp;
        _match.AddXp(s.SteamId64, s.Name, Progression.DuelWinXp);
        AnnounceLevelUp(p, s, levelBefore);
        OnMissionDuelWin(p, s);
    }
}
