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
/// Докато трае, моделът е зелен (m_clrRender) — вижда се само в пряка видимост. Контурен glow НЕ: в CS2
/// CGlowProperty няма настройка за стени и светенето минава през тях (решение на собственика).
/// </summary>
public sealed partial class CarbonStealthPlugin
{
    private static readonly Color ShieldTint = Color.FromArgb(255, 40, 220, 80);

    private readonly SpawnShield _shield = new();
    /// <summary>Слотовете, чийто модел сме оцветили (за да върнем само нашия цвят).</summary>
    private readonly HashSet<int> _tinted = new();

    private void RegisterSpawnProtection()
    {
        RegisterListener<Listeners.OnMapStart>(_ =>
        {
            _shield.Clear();
            _tinted.Clear();
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
        RegisterListener<Listeners.OnClientDisconnect>(slot =>
        {
            _shield.End(slot);
            _tinted.Remove(slot);
        });
    }

    private void StartShield(int slot, int seconds)
    {
        _shield.Start(slot, Server.CurrentTime, seconds);
        if (seconds <= 0) return;
        // Цветът — след кратко (появата и оръжията на DM са готови); накрая — само ако защитата вече е свалена.
        AddTimer(0.1f, () =>
        {
            if (_shield.IsProtected(slot, Server.CurrentTime)) Tint(slot);
        });
        AddTimer(Math.Min(seconds, SpawnShield.MaxSeconds) + 0.15f, () =>
        {
            if (!_shield.IsProtected(slot, Server.CurrentTime)) Untint(slot);
        });
    }

    private void EndShield(int slot)
    {
        _shield.End(slot);
        Untint(slot);
    }

    private HookResult OnTakeDamageShield(CBaseEntity entity, CTakeDamageInfo info)
    {
        if (entity is not { IsValid: true } || entity.DesignerName != "player") return HookResult.Continue;
        var victim = entity.As<CCSPlayerPawn>().OriginalController.Value;
        if (victim is not { IsValid: true }) return HookResult.Continue;
        return _shield.IsProtected(victim.Slot, Server.CurrentTime) ? HookResult.Handled : HookResult.Continue;
    }

    private void Tint(int slot)
    {
        var pawn = Utilities.GetPlayerFromSlot(slot)?.PlayerPawn.Value;
        if (pawn is not { IsValid: true, LifeState: (byte)LifeState_t.LIFE_ALIVE }) return;
        Colorize(pawn, ShieldTint);
        _tinted.Add(slot);
    }

    /// <summary>Връща белия цвят само ако моделът е още наш зелен — замразяване от админ (синьо) не се пипа.</summary>
    private void Untint(int slot)
    {
        if (!_tinted.Remove(slot)) return;
        var pawn = Utilities.GetPlayerFromSlot(slot)?.PlayerPawn.Value;
        if (pawn is { IsValid: true } && pawn.Render.ToArgb() == ShieldTint.ToArgb()) Colorize(pawn, NormalColor);
    }

    private void UntintAll()
    {
        foreach (var slot in _tinted.ToList()) Untint(slot);
    }
}
