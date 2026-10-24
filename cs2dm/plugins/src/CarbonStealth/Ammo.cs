using CarbonStealth.Logic;
using CounterStrikeSharp.API.Core;

namespace CarbonStealth;

/// <summary>
/// Безкраен резерв: при всяко презареждане резервът на огнестрелното оръжие се допълва. Не е
/// sv_infinite_ammo — той е „cheat“ cvar в CS2 и иска sv_cheats 1 на публичния сървър.
/// Пълнителят се пълни по нормалния начин (презареждането остава); резервът никога не стига 0.
/// </summary>
public sealed partial class CarbonStealthPlugin
{
    /// <summary>Колкото дава DM плъгинът при „Refill Ammo“ — с запас за всяко оръжие.</summary>
    private const int ReserveAmmoTopUp = 250;

    /// <summary>
    /// Живата настройка „ammo“ (CONTRACT §11; без ред — конфигът). Менюто !admin и панелът пишат
    /// един и същ ред в server_settings — едното вижда промяната на другото.
    /// </summary>
    private bool _infiniteAmmo;

    private void RegisterAmmo()
    {
        RegisterEventHandler<EventWeaponReload>((e, _) =>
        {
            // Играта мести патроните от резерва в края на анимацията — допълнено в началото, не свършва.
            if (_infiniteAmmo && e.Userid is { IsValid: true } player
                && player.PlayerPawn.Value?.WeaponServices?.ActiveWeapon.Value is { IsValid: true } weapon
                && Progression.IsGun(weapon.DesignerName))
            {
                weapon.ReserveAmmo[0] = Math.Max(weapon.ReserveAmmo[0], ReserveAmmoTopUp);
            }
            return HookResult.Continue;
        });
    }
}
