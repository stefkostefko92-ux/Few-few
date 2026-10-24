using CarbonStealth.Logic;
using CarbonStealth.State;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Modules.Admin;
using CounterStrikeSharp.API.Modules.Entities;
using Microsoft.Extensions.Logging;

namespace CarbonStealth;

/// <summary>
/// Мост роля → права на CounterStrikeSharp (AdminManager), за да познават екипа ни чуждите плъгини —
/// напр. CheaterTroll иска <c>@cheatertroll/admin</c>. Таблицата е в <see cref="CssFlagMap"/> (CONTRACT §1).
/// Правата са само в паметта (не в admins.json): даваме ги при всяко зареждане на ролята (влизане, на 60 s,
/// reload от сайта) и махаме само своите при понижение, излизане и спиране на плъгина.
/// </summary>
public sealed partial class CarbonStealthPlugin
{
    private readonly CssFlagLedger _cssFlags = new();
    /// <summary>Слот → SteamID64: при излизане играчът вече е махнат от регистъра.</summary>
    private readonly Dictionary<int, ulong> _cssFlagSlots = new();

    private void RegisterCssFlags() =>
        RegisterListener<Listeners.OnClientDisconnect>(slot =>
        {
            if (_cssFlagSlots.Remove(slot, out var steamId)) ApplyCssFlags(steamId, _cssFlags.Forget(steamId, CssFlagsOf(steamId)));
        });

    private void SyncCssFlags(PlayerState state)
    {
        _cssFlagSlots[state.Slot] = state.SteamId;
        ApplyCssFlags(state.SteamId, _cssFlags.Sync(state.SteamId, state.Role, CssFlagsOf(state.SteamId)));
    }

    private void ClearCssFlags()
    {
        foreach (var steamId in _cssFlags.Tracked.ToList()) ApplyCssFlags(steamId, _cssFlags.Forget(steamId, CssFlagsOf(steamId)));
        _cssFlagSlots.Clear();
    }

    /// <summary>Правата на играча в CSS в момента (admins.json + дадените); null = няма запис.</summary>
    private static HashSet<string>? CssFlagsOf(ulong steamId) =>
        AdminManager.GetPlayerAdminData(new SteamID(steamId))?.GetAllFlags();

    private void ApplyCssFlags(ulong steamId, CssFlagPlan plan)
    {
        if (plan.IsEmpty) return;
        var id = new SteamID(steamId);
        if (plan.Remove.Count > 0) AdminManager.RemovePlayerPermissions(id, [.. plan.Remove]);
        if (plan.Add.Count > 0) AdminManager.AddPlayerPermissions(id, [.. plan.Add]);
        if (plan.DropEntry) AdminManager.RemovePlayerAdminData(id);
        Logger.LogInformation("CarbonStealth: CSS flags for {SteamId}: +[{Add}] -[{Remove}]",
            steamId, string.Join(' ', plan.Add), string.Join(' ', plan.Remove));
    }
}
