using CarbonStealth.Data;
using CarbonStealth.Logic;
using CarbonStealth.State;
using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Modules.Utils;

namespace CarbonStealth;

public sealed partial class CarbonStealthPlugin
{
    private void RegisterGameEvents()
    {
        RegisterEventHandler<EventPlayerDeath>(OnPlayerDeath);
        RegisterEventHandler<EventPlayerHurt>(OnPlayerHurt);
        RegisterEventHandler<EventWeaponFire>(OnWeaponFire);
    }

    private PlayerState? Human(CCSPlayerController? p) =>
        p is { IsValid: true, IsBot: false } ? _players.BySlot(p.Slot) is { Loaded: true } s ? s : null : null;

    private HookResult OnPlayerDeath(EventPlayerDeath e, GameEventInfo info)
    {
        var victim = e.Userid;
        if (victim is not { IsValid: true }) return HookResult.Continue;
        var attacker = e.Attacker;
        var v = Human(victim);
        var a = Human(attacker);

        if (Human(e.Assister) is { } assist && e.Assister!.Slot != victim.Slot) _batch.For(assist.SteamId64, assist.Name).Assists++;

        // Сравнение по слот: обвивките на контролерите са нови обекти при всяко събитие.
        var suicide = attacker is null || !attacker.IsValid || attacker.Slot == victim.Slot;
        if (v is not null && (suicide || attacker!.IsBot)) _streaks.RecordDeath(v.SteamId);
        if (v is not null && suicide)
        {
            // Самоубийство/падане — смърт се брои; от бот — не (ботовете не влизат в статистиките).
            v.SessionDeaths++;
            _batch.For(v.SteamId64, v.Name).Deaths++;
        }
        if (v is null || a is null || suicide) return HookResult.Continue;

        var outcome = _streaks.RecordKill(a.SteamId, v.SteamId);
        var weapon = Progression.NormalizeWeapon(e.Weapon);
        var facts = new KillFacts(
            Headshot: e.Headshot,
            Knife: Progression.IsKnife(e.Weapon),
            Noscope: e.Noscope && Progression.IsSniper(e.Weapon),
            Wallbang: e.Penetrated > 0,
            ThroughSmoke: e.Thrusmoke,
            Revenge: outcome.Revenge,
            BountyClaimed: outcome.BountyClaimed);
        var xp = Progression.ApplyMultiplier(Progression.XpForKill(facts), XpTenths());
        var levelBefore = a.Level;
        a.Xp += xp;
        a.SessionKills++;
        v.SessionDeaths++;

        var ad = _batch.For(a.SteamId64, a.Name);
        ad.Kills++;
        ad.Xp += xp;
        if (e.Headshot) ad.Headshots++;
        ad.BestStreak = Math.Max(ad.BestStreak, outcome.AttackerStreak);
        if (outcome.BountyClaimed > 0) ad.BountiesClaimed++;
        if (outcome.Revenge) ad.Revenges++;
        _batch.AddWeapon(a.SteamId64, weapon, e.Headshot);
        _batch.For(v.SteamId64, v.Name).Deaths++;

        var ap = attacker!.PlayerPawn.Value?.AbsOrigin;
        var vp = victim.PlayerPawn.Value?.AbsOrigin;
        if (ap is not null && vp is not null && _batch.Kills.Count < StatsBatch.MaxBufferedKills)
        {
            _batch.Kills.Add(new KillRow(DateTimeOffset.UtcNow, CurrentModeName(), a.SteamId64, v.SteamId64, weapon,
                e.Headshot, facts.Wallbang, facts.Noscope, e.Thrusmoke, e.Attackerblind, e.Distance,
                ap.X, ap.Y, ap.Z, vp.X, vp.Y, vp.Z));
        }

        if (outcome.BountyClaimed > 0) Broadcast("bounty.claimed", a.Name, v.Name, outcome.BountyClaimed);
        if (outcome.Revenge) Broadcast("revenge", a.Name, v.Name);
        if (outcome.AttackerStreak >= StreakTracker.BountyStartStreak && outcome.AttackerStreak % 5 == 0)
        {
            Broadcast("bounty.on", a.Name, outcome.AttackerStreak, outcome.NewBountyOnAttacker);
            _bridge?.Event("bounty", new { steamId = a.SteamId64, name = a.Name, streak = outcome.AttackerStreak, bounty = outcome.NewBountyOnAttacker });
        }
        if (a.Level > levelBefore)
        {
            Broadcast("levelup", a.Name, a.Level);
            ApplyTag(attacker, a, DateTimeOffset.UtcNow);
        }
        _bridge?.Event("kill", new { attacker = a.SteamId64, victim = v.SteamId64, weapon, hs = e.Headshot, revenge = outcome.Revenge });
        return HookResult.Continue;
    }

    private HookResult OnPlayerHurt(EventPlayerHurt e, GameEventInfo info)
    {
        if (e.Attacker is null || e.Userid is null || e.Attacker.Slot == e.Userid.Slot) return HookResult.Continue;
        if (Human(e.Attacker) is not { } a || Human(e.Userid) is null) return HookResult.Continue;
        var d = _batch.For(a.SteamId64, a.Name);
        d.Damage += Math.Max(0, e.DmgHealth);
        if (Progression.IsGun(e.Weapon)) d.ShotsHit++;
        return HookResult.Continue;
    }

    private HookResult OnWeaponFire(EventWeaponFire e, GameEventInfo info)
    {
        if (Human(e.Userid) is { } s && Progression.IsGun(e.Weapon)) _batch.For(s.SteamId64, s.Name).ShotsFired++;
        return HookResult.Continue;
    }

    /// <summary>На FlushSeconds: време в играта + запис на партидата; при грешка партидата се връща обратно.</summary>
    private void FlushStats()
    {
        AccruePlaytime();
        if (_flushing || _db is not { } db || _batch.IsEmpty) return;
        var batch = _batch;
        _batch = new StatsBatch();
        _flushing = true;
        var season = _seasonId;
        RunDb(() => db.FlushAsync(batch, season), "flush",
            onDone: () => _flushing = false,
            onError: () =>
            {
                _batch.Merge(batch);
                _flushing = false;
            });
    }

    private string LiveJson()
    {
        var now = DateTimeOffset.UtcNow;
        var players = Utilities.GetPlayers()
            .Where(p => p is { IsValid: true } && p.Connected == PlayerConnectedState.Connected)
            .Select(p =>
            {
                var s = p.IsBot ? null : _players.BySlot(p.Slot);
                return new
                {
                    steamId = s?.SteamId64,
                    name = s?.Name ?? Text.SafeName(p.PlayerName),
                    kills = s?.SessionKills ?? 0,
                    deaths = s?.SessionDeaths ?? 0,
                    ping = p.IsBot ? 0 : (int)p.Ping,
                    alive = p.PawnIsAlive,
                    isBot = p.IsBot,
                    vip = s?.IsVip(now) ?? false,
                    role = (s?.Role ?? Role.Player).ToString().ToUpperInvariant(),
                    level = s?.Level,
                };
            })
            .ToList();
        return System.Text.Json.JsonSerializer.Serialize(new
        {
            ts = now.ToUnixTimeMilliseconds(),
            map = Server.MapName,
            mode = CurrentModeName(),
            maxPlayers = Server.MaxPlayers,
            players,
        });
    }

    private void PublishLive()
    {
        if (_bridge is not { } bridge) return;
        bridge.PublishLive(LiveJson());
    }
}
