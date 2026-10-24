using System.Text.Json.Serialization;
using CounterStrikeSharp.API.Core;

namespace CarbonStealth;

/// <summary>
/// configs/plugins/CarbonStealth/CarbonStealth.json — пише го install-plugins.sh от /etc/cs2/cs2.env
/// (права 0600, собственик cs2). Тайни никога в репото.
/// </summary>
public sealed class PluginConfig : BasePluginConfig
{
    /// <summary>Npgsql низ, напр. Host=127.0.0.1;Port=5442;Database=cs2dm;Username=cs2dm;Password=…</summary>
    [JsonPropertyName("DatabaseConnection")] public string DatabaseConnection { get; set; } = "";

    /// <summary>StackExchange.Redis низ, напр. 127.0.0.1:6392,password=…,abortConnect=false</summary>
    [JsonPropertyName("RedisConnection")] public string RedisConnection { get; set; } = "";

    /// <summary>Общият HMAC ключ на моста (CS2DM_BRIDGE_KEY), поне 32 знака.</summary>
    [JsonPropertyName("BridgeKey")] public string BridgeKey { get; set; } = "";

    [JsonPropertyName("SiteUrl")] public string SiteUrl { get; set; } = "cs2.carbonstealth.eu";

    /// <summary>Публични слотове при запазени за VIP/админи (0 = изключено). Виж CS2_MAXPLAYERS.</summary>
    [JsonPropertyName("PublicSlots")] public int PublicSlots { get; set; }

    [JsonPropertyName("FlushSeconds")] public int FlushSeconds { get; set; } = 10;

    /// <summary>Реклама в чата на всеки N секунди (0 = изключено, иначе 60–3600).</summary>
    [JsonPropertyName("AdvertSeconds")] public int AdvertSeconds { get; set; } = 240;

    /// <summary>Безкраен резерв на патроните (допълва се при всяко презареждане).</summary>
    [JsonPropertyName("InfiniteReserveAmmo")] public bool InfiniteReserveAmmo { get; set; } = true;

    /// <summary>
    /// Банери-картинки от Workshop addon-а: ключ → модел („models/carbonstealth/….vmdl“).
    /// Празно = само текстовите банери. Addon-ът се зарежда от MultiAddonManager (CS2_WORKSHOP_ADDONS).
    /// </summary>
    [JsonPropertyName("BannerModels")] public Dictionary<string, string> BannerModels { get; set; } = new();
}
