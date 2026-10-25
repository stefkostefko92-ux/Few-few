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

    /// <summary>Делтата на играча в партидата — с епохата, която плъгинът знае за него (CONTRACT §3).</summary>
    private PlayerDelta Delta(PlayerState s) => _batch.For(s.SteamId64, s.Name, s.StatsEpoch);

    private PlayerState? Human(CCSPlayerController? p) =>
        p is { IsValid: true, IsBot: false } ? _players.BySlot(p.Slot) is { Loaded: true } s ? s : null : null;

    private HookResult OnPlayerDeath(EventPlayerDeath e, GameEventInfo info)
    {
        var victim = e.Userid;
        if (victim is not { IsValid: true }) return HookResult.Continue;
        var attacker = e.Attacker;
        var v = Human(victim);
        var a = Human(attacker);

        if (Human(e.Assister) is { } assist && e.Assister!.Slot != victim.Slot) Delta(assist).Assists++;

        // Сравнение по слот: обвивките на контролерите са нови обекти при всяко събитие.
        var suicide = attacker is null || !attacker.IsValid || attacker.Slot == victim.Slot;
        if (v is not null && (suicide || attacker!.IsBot)) _streaks.RecordDeath(v.SteamId);
        if (v is not null && suicide) _match.Death(v.SteamId64, v.Name);
        else if (v is not null && attacker!.IsBot) _match.StreakBroken(v.SteamId64);
        if (v is not null && suicide)
        {
            // Самоубийство/падане — смърт се брои; от бот — не (ботовете не влизат в статистиките).
            v.SessionDeaths++;
            Delta(v).Deaths++;
        }
        if (a is not null && !suicide && victim.IsBot)
        {
            RewardBotKill(attacker!, a, e);
            return HookResult.Continue;
        }
        if (v is null || a is null || suicide) return HookResult.Continue;

        var outcome = _streaks.RecordKill(a.SteamId, v.SteamId);
        var weapon = Progression.NormalizeWeapon(e.Weapon);
        var facts = FactsOf(e, outcome.Revenge, outcome.BountyClaimed);
        var inZone = InHotZone(attacker);
        var wanted = IsWanted(v);
        var xp = Progression.HotZoneXp(Progression.ApplyMultiplier(
            Progression.XpForKill(facts) + Progression.MostWantedBonus(wanted), XpTenths()), inZone);
        if (inZone) _zoneRound.Kill(a.SteamId64, a.Name);
        var levelBefore = a.Level;
        a.Xp += xp;
        a.SessionKills++;
        v.SessionDeaths++;

        var ad = Delta(a);
        ad.Kills++;
        ad.Xp += xp;
        if (e.Headshot) ad.Headshots++;
        ad.BestStreak = Math.Max(ad.BestStreak, outcome.AttackerStreak);
        if (outcome.BountyClaimed > 0) ad.BountiesClaimed++;
        if (outcome.Revenge) ad.Revenges++;
        _batch.AddWeapon(a.SteamId64, a.StatsEpoch, weapon, e.Headshot);
        _match.Kill(a.SteamId64, a.Name, v.SteamId64, v.Name, weapon, e.Headshot, outcome.BountyClaimed > 0, xp);
        Delta(v).Deaths++;

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
        OnWantedKill(a, v, wanted);
        OnDuelKill(a, v);
        if (outcome.AttackerStreak >= StreakTracker.BountyStartStreak && outcome.AttackerStreak % 5 == 0)
        {
            Broadcast("bounty.on", a.Name, outcome.AttackerStreak, outcome.NewBountyOnAttacker);
            _bridge?.Event("bounty", new { steamId = a.SteamId64, name = a.Name, streak = outcome.AttackerStreak, bounty = outcome.NewBountyOnAttacker });
        }
        AnnounceLevelUp(attacker, a, levelBefore);
        // След обявата за убийството — мисиите обявяват своето ниво сами (§16).
        OnMissionKill(attacker!, a, new MissionKill(weapon, e.Headshot, facts.Knife, facts.Wallbang, facts.ThroughSmoke,
            facts.Noscope, outcome.AttackerStreak, inZone, wanted));
        _bridge?.Event("kill", new { attacker = a.SteamId64, victim = v.SteamId64, weapon, hs = e.Headshot, revenge = outcome.Revenge });
        return HookResult.Continue;
    }

    private static KillFacts FactsOf(EventPlayerDeath e, bool revenge, int bountyClaimed) => new(
        Headshot: e.Headshot,
        Knife: Progression.IsKnife(e.Weapon),
        Noscope: e.Noscope && Progression.IsSniper(e.Weapon),
        Wallbang: e.Penetrated > 0,
        ThroughSmoke: e.Thrusmoke,
        Revenge: revenge,
        BountyClaimed: bountyClaimed);

    /// <summary>
    /// Убит бот: половината XP (CONTRACT.md §3; в горещата зона — × 2, §15) и нищо друго — убийство, K/D,
    /// серия, баунти, оръжия и heatmap остават само между хора, за да не се „ферми“ класацията на празен сървър.
    /// </summary>
    private void RewardBotKill(CCSPlayerController attacker, PlayerState a, EventPlayerDeath e)
    {
        var xp = Progression.HotZoneXp(Progression.BotKillXp(
            Progression.ApplyMultiplier(Progression.XpForKill(FactsOf(e, revenge: false, bountyClaimed: 0)), XpTenths())),
            InHotZone(attacker));
        if (xp <= 0) return;
        var levelBefore = a.Level;
        a.Xp += xp;
        Delta(a).Xp += xp;
        _match.BotKill(a.SteamId64, a.Name, xp);
        AnnounceLevelUp(attacker, a, levelBefore);
    }

    private void AnnounceLevelUp(CCSPlayerController attacker, PlayerState a, int levelBefore)
    {
        if (a.Level <= levelBefore) return;
        Broadcast("levelup", a.Name, a.Level);
        ApplyTag(attacker, a, DateTimeOffset.UtcNow);
    }

    private HookResult OnPlayerHurt(EventPlayerHurt e, GameEventInfo info)
    {
        if (e.Attacker is null || e.Userid is null || e.Attacker.Slot == e.Userid.Slot) return HookResult.Continue;
        if (Human(e.Attacker) is not { } a || Human(e.Userid) is null) return HookResult.Continue;
        var d = Delta(a);
        d.Damage += Math.Max(0, e.DmgHealth);
        if (Progression.IsGun(e.Weapon)) d.ShotsHit++;
        return HookResult.Continue;
    }

    private HookResult OnWeaponFire(EventWeaponFire e, GameEventInfo info)
    {
        if (Human(e.Userid) is { } s && Progression.IsGun(e.Weapon)) Delta(s).ShotsFired++;
        return HookResult.Continue;
    }

    /// <summary>На FlushSeconds: време в играта + запис на партидата; при грешка партидата се връща обратно.</summary>
    private void FlushStats()
    {
        AccruePlaytime();
        FlushMissions();
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
            perf = LivePerf(),
        });
    }

    private void PublishLive()
    {
        if (_bridge is not { } bridge) return;
        bridge.PublishLive(LiveJson());
    }
}
