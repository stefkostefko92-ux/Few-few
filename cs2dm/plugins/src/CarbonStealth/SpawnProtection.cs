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
/// </summary>
public sealed partial class CarbonStealthPlugin
{
    private readonly SpawnShield _shield = new();

    private void RegisterSpawnProtection()
    {
        RegisterListener<Listeners.OnMapStart>(_ => _shield.Clear());
        RegisterListener<Listeners.OnEntityTakeDamagePre>(OnTakeDamageShield);
        RegisterEventHandler<EventPlayerSpawn>((e, _) =>
        {
            if (e.Userid is { IsValid: true } p && p.Team is CsTeam.Terrorist or CsTeam.CounterTerrorist)
            {
                _shield.Start(p.Slot, Server.CurrentTime, Config.SpawnProtectionSeconds);
            }
            return HookResult.Continue;
        });
        // Изстрел (и замах с нож) сваля защитата — неуязвимият не стреля.
        RegisterEventHandler<EventWeaponFire>((e, _) =>
        {
            if (e.Userid is { IsValid: true } p) _shield.End(p.Slot);
            return HookResult.Continue;
        });
        RegisterEventHandler<EventPlayerDeath>((e, _) =>
        {
            if (e.Userid is { IsValid: true } p) _shield.End(p.Slot);
            return HookResult.Continue;
        });
        RegisterListener<Listeners.OnClientDisconnect>(slot => _shield.End(slot));
    }

    private HookResult OnTakeDamageShield(CBaseEntity entity, CTakeDamageInfo info)
    {
        if (entity is not { IsValid: true } || entity.DesignerName != "player") return HookResult.Continue;
        var victim = entity.As<CCSPlayerPawn>().OriginalController.Value;
        if (victim is not { IsValid: true }) return HookResult.Continue;
        return _shield.IsProtected(victim.Slot, Server.CurrentTime) ? HookResult.Handled : HookResult.Continue;
    }
}
