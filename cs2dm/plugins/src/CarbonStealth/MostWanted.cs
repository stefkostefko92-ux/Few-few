using CarbonStealth.Logic;
using CarbonStealth.State;
using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Core.Translations;

namespace CarbonStealth;

/// <summary>
/// „Most Wanted“ (CONTRACT.md §15): човекът с най-много убийства на хора на картата (поне 10) — обява в чата и
/// центъра при всяка смяна; който го свали, взема +25 XP (преди множителя, като баунтито). Отделно от баунтито
/// за серия и никога през клан тага (той е за ролите/нивото).
/// </summary>
public sealed partial class CarbonStealthPlugin
{
    private readonly MostWantedBoard _wanted = new();

    private void RegisterMostWanted()
    {
        RegisterListener<Listeners.OnMapStart>(_ => _wanted.Reset());
        // Основното OnClientDisconnect вече е махнало играча от регистъра — тук само проверяваме кой остава.
        RegisterListener<Listeners.OnClientDisconnect>(_ => Server.NextFrame(() =>
        {
            var online = Humans().Select(p => _players.BySlot(p.Slot)?.SteamId64).OfType<string>().ToHashSet();
            if (_wanted.SyncPresence(online)) AnnounceWanted();
        }));
    }

    /// <summary>Жертвата е Most Wanted в момента на убийството (преди броят на убиеца да се смени).</summary>
    private bool IsWanted(PlayerState victim) => _wanted.Current == victim.SteamId64;

    /// <summary>След убийство между хора: обява за свалянето и новата класация.</summary>
    private void OnWantedKill(PlayerState attacker, PlayerState victim, bool victimWanted)
    {
        if (victimWanted) Broadcast("wanted.down", attacker.Name, victim.Name, Progression.MostWantedXp);
        if (_wanted.Kill(attacker.SteamId64, attacker.Name)) AnnounceWanted();
    }

    private void AnnounceWanted()
    {
        if (_wanted.Current is not { } id || _wanted.CurrentName is not { } name)
        {
            Broadcast("wanted.gone");
            return;
        }
        var kills = _wanted.KillsOf(id);
        Announce(p => Localizer.ForPlayer(p, "wanted.new", name, kills, Progression.MostWantedXp),
            p => Localizer.ForPlayer(p, "hud.wanted.new", name, Progression.MostWantedXp));
    }
}
