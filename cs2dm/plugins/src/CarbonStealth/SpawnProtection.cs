using System.Drawing;
using CarbonStealth.Logic;
using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Modules.Utils;

namespace CarbonStealth;

/// <summary>
/// Защитата при поява е наша, не на Deathmatch: в 1.3.6 неговата кука проверява DesignerName
/// „cs_player_pawn“, а пешката на играча в CS2 е „player“ — излиза веднага и защитата не тръгва никога;
/// вградената (mp_respawn_immunitytime) DM я нулира при всяка карта. Тук щетата се спира с Handled —
/// в CSS 1.0.378 само Handled/Stop прескача истинското TakeDamage (Damage = 0 + Continue не стига).
/// Докато трае, играчът свети в зелено (glow) — виждат го всички, за да не стрелят напразно.
/// </summary>
public sealed partial class CarbonStealthPlugin
{
    private static readonly Color ShieldGlow = Color.FromArgb(255, 40, 220, 80);

    private readonly SpawnShield _shield = new();
    /// <summary>Слот → двата спомагателни модела на glow-а (релей + светещ) като EntityHandle.Raw.</summary>
    private readonly Dictionary<int, (uint Relay, uint Glow)> _glows = new();

    private void RegisterSpawnProtection()
    {
        // Смяната на картата унищожава всички същности — само забравяме (никакво Remove по стари handle-и).
        RegisterListener<Listeners.OnMapStart>(_ =>
        {
            _shield.Clear();
            _glows.Clear();
        });
        RegisterListener<Listeners.OnEntityTakeDamagePre>(OnTakeDamageShield);
        RegisterEventHandler<EventPlayerSpawn>((e, _) =>
        {
            if (e.Userid is { IsValid: true } p && p.Team is CsTeam.Terrorist or CsTeam.CounterTerrorist)
            {
                StartShield(p.Slot, Config.SpawnProtectionSeconds);
            }
            return HookResult.Continue;
        });
        // Изстрел (и замах с нож) сваля защитата — неуязвимият не стреля.
        RegisterEventHandler<EventWeaponFire>((e, _) =>
        {
            if (e.Userid is { IsValid: true } p) EndShield(p.Slot);
            return HookResult.Continue;
        });
        RegisterEventHandler<EventPlayerDeath>((e, _) =>
        {
            if (e.Userid is { IsValid: true } p) EndShield(p.Slot);
            return HookResult.Continue;
        });
        RegisterListener<Listeners.OnClientDisconnect>(EndShield);
    }

    private void StartShield(int slot, int seconds)
    {
        StopGlow(slot);
        _shield.Start(slot, Server.CurrentTime, seconds);
        if (seconds <= 0) return;
        // Моделът на агента е готов след появата — glow-ът след кратко; накрая — само ако защитата вече е свалена.
        AddTimer(0.1f, () =>
        {
            if (_shield.IsProtected(slot, Server.CurrentTime)) StartGlow(slot);
        });
        AddTimer(Math.Min(seconds, SpawnShield.MaxSeconds) + 0.15f, () =>
        {
            if (!_shield.IsProtected(slot, Server.CurrentTime)) StopGlow(slot);
        });
    }

    private void EndShield(int slot)
    {
        _shield.End(slot);
        StopGlow(slot);
    }

    private HookResult OnTakeDamageShield(CBaseEntity entity, CTakeDamageInfo info)
    {
        if (entity is not { IsValid: true } || entity.DesignerName != "player") return HookResult.Continue;
        var victim = entity.As<CCSPlayerPawn>().OriginalController.Value;
        if (victim is not { IsValid: true }) return HookResult.Continue;
        return _shield.IsProtected(victim.Slot, Server.CurrentTime) ? HookResult.Handled : HookResult.Continue;
    }

    /// <summary>
    /// Glow на играч в CS2: невидим релей, закачен за пешката (FollowEntity), и копие на модела със светене,
    /// закачено за релея. И двата са без колизия — не спират куршуми и хора.
    /// </summary>
    private void StartGlow(int slot)
    {
        StopGlow(slot);
        var pawn = Utilities.GetPlayerFromSlot(slot)?.PlayerPawn.Value;
        if (pawn is not { IsValid: true, LifeState: (byte)LifeState_t.LIFE_ALIVE }) return;
        var model = pawn.CBodyComponent?.SceneNode?.GetSkeletonInstance().ModelState.ModelName;
        if (string.IsNullOrEmpty(model)) return;
        var relay = Utilities.CreateEntityByName<CDynamicProp>("prop_dynamic");
        var glow = Utilities.CreateEntityByName<CDynamicProp>("prop_dynamic");
        if (relay is null || glow is null)
        {
            relay?.Remove();
            glow?.Remove();
            return;
        }
        relay.SetModel(model);
        relay.Spawnflags = 256u;
        relay.RenderMode = RenderMode_t.kRenderNone;
        relay.Collision.SolidType = SolidType_t.SOLID_NONE;
        relay.DispatchSpawn();
        glow.SetModel(model);
        glow.Spawnflags = 256u;
        glow.Collision.SolidType = SolidType_t.SOLID_NONE;
        glow.DispatchSpawn();
        glow.Glow.GlowColorOverride = ShieldGlow;
        glow.Glow.GlowRange = 5000;
        glow.Glow.GlowRangeMin = 20;
        glow.Glow.GlowTeam = -1;
        glow.Glow.GlowType = 3;
        relay.AcceptInput("FollowEntity", pawn, relay, "!activator");
        glow.AcceptInput("FollowEntity", relay, glow, "!activator");
        _glows[slot] = (relay.EntityHandle.Raw, glow.EntityHandle.Raw);
    }

    private void StopGlow(int slot)
    {
        if (!_glows.Remove(slot, out var g)) return;
        RemoveByHandle(g.Glow);
        RemoveByHandle(g.Relay);
    }

    private void StopAllGlows()
    {
        foreach (var slot in _glows.Keys.ToList()) StopGlow(slot);
    }

    /// <summary>Handle-ът носи и сериен номер — изтрита и преизползвана същност не се маха по погрешка.</summary>
    private static void RemoveByHandle(uint raw)
    {
        if (new CHandle<CBaseEntity>(raw).Value is { IsValid: true } e) e.Remove();
    }
}
