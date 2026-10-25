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

    /// <summary>Жив играч без вход толкова секунди → наблюдател (0 = изключено, иначе 30–3600). CS2DM_AFK_SECONDS.</summary>
    [JsonPropertyName("AfkSeconds")] public int AfkSeconds { get; set; } = 90;

    /// <summary>Среден пинг над прага → наблюдател, никога kick (0 = изключено, иначе 50–1000 ms). CS2DM_MAX_PING.</summary>
    [JsonPropertyName("MaxPing")] public int MaxPing { get; set; } = 150;

    /// <summary>Защита при поява в секунди — сваля я първият изстрел (0 = изключено, иначе 1–15). CS2DM_SPAWN_PROTECTION.</summary>
    [JsonPropertyName("SpawnProtectionSeconds")] public int SpawnProtectionSeconds { get; set; } = 5;

    /// <summary>Горещата зона на всеки N минути, активна 3 (0 = изключено, иначе 4–60). CS2DM_HOTZONE_EVERY.</summary>
    [JsonPropertyName("HotZoneEveryMinutes")] public int HotZoneEveryMinutes { get; set; } = 8;
}
