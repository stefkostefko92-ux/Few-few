using CarbonStealth.Logic;
using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;

namespace CarbonStealth;

/// <summary>Обявите на режимите (гореща зона, Most Wanted, дуели): чат + център, всеки на своя език; кой е онлайн.</summary>
public sealed partial class CarbonStealthPlugin
{
    private const int CenterSeconds = 4;

    private static IEnumerable<CCSPlayerController> Humans() =>
        Utilities.GetPlayers().Where(p => p is { IsValid: true, IsBot: false, IsHLTV: false });

    private static bool AnyHuman() => Humans().Any(p => p.Connected == PlayerConnectedState.Connected);

    /// <summary>SteamID64 на заредените хора на сървъра — за присъствието в Most Wanted и дуелите.</summary>
    private HashSet<string> OnlineSteamIds() =>
        Humans().Select(p => _players.BySlot(p.Slot)?.SteamId64).OfType<string>().ToHashSet(StringComparer.Ordinal);

    /// <summary>Контролерът на онлайн играч по SteamID64 (за известия след таймер/излизане) или null.</summary>
    private CCSPlayerController? PlayerOf(string steamId64) =>
        ulong.TryParse(steamId64, System.Globalization.NumberStyles.None, System.Globalization.CultureInfo.InvariantCulture,
            out var id) && _players.BySteamId(id) is { } s && Utilities.GetPlayerFromSlot(s.Slot) is { IsValid: true } p
            ? p
            : null;

    /// <summary>Отвореното WASD меню държи центъра (иначе мига) — там остава само чатът.</summary>
    private void Announce(Func<CCSPlayerController, string> chat, Func<CCSPlayerController, string> center)
    {
        foreach (var p in Humans())
        {
            p.PrintToChat(chat(p));
            if (!_huds.ContainsKey(p.Slot)) CenterTo(p, center(p));
        }
    }

    private void CenterTo(CCSPlayerController p, string text)
    {
        if (_huds.ContainsKey(p.Slot)) return;
        p.PrintToCenterHtml(
            $"<font color='{HudMenuRenderer.Gold}' class='fontSize-l'><b>{HudMenuRenderer.Escape(text)}</b></font>",
            CenterSeconds);
    }
}
