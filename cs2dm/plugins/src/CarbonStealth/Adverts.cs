using CarbonStealth.Logic;
using CounterStrikeSharp.API.Modules.Timers;

namespace CarbonStealth;

/// <summary>Реклами в чата: по една на <see cref="PluginConfig.AdvertSeconds"/>, всеки на своя език.</summary>
public sealed partial class CarbonStealthPlugin
{
    private readonly AdvertRotation _adverts = new(["advert.carbonstealth", "advert.adblock", "advert.site"]);

    private void RegisterAdverts()
    {
        if (Config.AdvertSeconds <= 0) return;
        AddTimer(Config.AdvertSeconds, () =>
        {
            if (_adverts.Next() is { } key) Broadcast(key, Config.SiteUrl);
        }, TimerFlags.REPEAT);
    }
}
