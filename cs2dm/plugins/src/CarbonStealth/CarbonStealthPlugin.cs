using CarbonStealth.Data;
using CarbonStealth.Logic;
using CarbonStealth.State;
using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Core.Attributes;
using CounterStrikeSharp.API.Core.Capabilities;
using CounterStrikeSharp.API.Core.Translations;
using CounterStrikeSharp.API.Modules.Timers;
using DeathmatchAPI;
using Microsoft.Extensions.Logging;

namespace CarbonStealth;

/// <summary>
/// Плъгинът на „CarbonStealth.eu | Dust2 DM“: банове и админ меню (PostgreSQL), статистики и XP,
/// баунти и отмъщение, тагове в чата, мост към сайта (Redis). Договорът е в cs2dm/CONTRACT.md.
/// Правило: игровите обекти се пипат само от игровата нишка; базата и Redis — само извън нея.
/// </summary>
[MinimumApiVersion(378)]
public sealed partial class CarbonStealthPlugin : BasePlugin, IPluginConfig<PluginConfig>
{
    public override string ModuleName => "CarbonStealth";
    public override string ModuleVersion => "0.1.0";
    public override string ModuleAuthor => "Carbon Stealth VCC";
    public override string ModuleDescription => "Bans, admin menu, stats, bounties and the web bridge for CarbonStealth.eu | Dust2 DM";

    private static readonly PluginCapability<IDeathmatchAPI> DeathmatchCapability = new("deathmatch");

    public PluginConfig Config { get; set; } = new();

    private Database? _db;
    private BridgeClient? _bridge;
    private IDeathmatchAPI? _dm;
    private readonly PlayerRegistry _players = new();
    private readonly StreakTracker _streaks = new();
    private StatsBatch _batch = new();
    private int _seasonId;
    private bool _flushing;

    public void OnConfigParsed(PluginConfig config)
    {
        if (config.FlushSeconds is < 2 or > 300) config.FlushSeconds = 10;
        if (config.AdvertSeconds is not 0 and (< 60 or > 3600)) config.AdvertSeconds = 240;
        if (config.AfkSeconds is not 0 and (< 30 or > 3600)) config.AfkSeconds = 90;
        if (config.MaxPing is not 0 and (< 50 or > 1000)) config.MaxPing = 150;
        if (config.SpawnProtectionSeconds is not 0 and (< 1 or > SpawnShield.MaxSeconds)) config.SpawnProtectionSeconds = 5;
        // Пътищата отиват в манифеста за precache — само наши модели, без „..“.
        foreach (var (key, model) in config.BannerModels.ToList())
        {
            if (BannerCatalog.IsValidKey(key) && !BannerCatalog.Text.ContainsKey(key)
                && model.StartsWith("models/", StringComparison.Ordinal) && model.EndsWith(".vmdl", StringComparison.Ordinal)
                && !model.Contains("..", StringComparison.Ordinal))
            {
                continue;
            }
            Logger.LogWarning("CarbonStealth: BannerModels entry {Key} ignored (bad key or path)", key);
            config.BannerModels.Remove(key);
        }
        Config = config;
    }

    public override void Load(bool hotReload)
    {
        if (string.IsNullOrWhiteSpace(Config.DatabaseConnection))
        {
            Logger.LogError("CarbonStealth: DatabaseConnection is empty — plugin stays idle (run install-plugins.sh)");
            return;
        }

        _db = Database.Create(Config.DatabaseConnection);
        StartBridge();

        RegisterListener<Listeners.OnClientAuthorized>(OnClientAuthorized);
        RegisterListener<Listeners.OnClientDisconnect>(OnClientDisconnect);
        RegisterGameEvents();
        RegisterChat();
        RegisterAdminCommands();
        RegisterBanners();
        RegisterAmmo();
        RegisterSettings();
        RegisterHud();
        RegisterFunCommands();
        RegisterMatchEnd();
        RegisterCssFlags();
        RegisterFairPlay();
        RegisterSpawnProtection();
        RegisterEvents();
        RegisterMatch();

        AddTimer(Config.FlushSeconds, FlushStats, TimerFlags.REPEAT);
        AddTimer(5f, PublishLive, TimerFlags.REPEAT);
        AddTimer(60f, RefreshOnlinePlayers, TimerFlags.REPEAT);
        AddTimer(600f, RefreshSeason, TimerFlags.REPEAT);
        RefreshSeason();

        if (hotReload)
        {
            foreach (var p in Utilities.GetPlayers().Where(p => p is { IsValid: true, IsBot: false } && p.AuthorizedSteamID is not null))
            {
                OnClientAuthorized(p.Slot, p.AuthorizedSteamID!);
            }
        }
    }

    public override void OnAllPluginsLoaded(bool hotReload)
    {
        try
        {
            _dm = DeathmatchCapability.Get();
        }
        catch (Exception e)
        {
            Logger.LogWarning(e, "CarbonStealth: Deathmatch API not available — mode names fall back to \"dm\"");
        }
    }

    public override void Unload(bool hotReload)
    {
        RemoveBannerEntities();
        StopAllGlows();
        foreach (var slot in _huds.Keys.ToList()) CloseHud(slot);
        ClearCssFlags();
        AccruePlaytime();
        var last = _batch;
        _batch = new StatsBatch();
        var db = _db;
        var bridge = _bridge;
        _db = null;
        _bridge = null;
        // Последната партида — синхронно, но с таван, за да не задържи спирането на сървъра.
        Task.Run(async () =>
        {
            try
            {
                if (db is not null)
                {
                    await db.FlushAsync(last, _seasonId);
                    await db.DisposeAsync();
                }
                if (bridge is not null) await bridge.DisposeAsync();
            }
            catch (Exception e)
            {
                Logger.LogError(e, "CarbonStealth: final flush failed");
            }
        }).Wait(TimeSpan.FromSeconds(5));
    }

    private void RefreshSeason()
    {
        if (_db is not { } db) return;
        RunDb(db.CurrentSeasonAsync, id => _seasonId = id, "season");
    }

    private string CurrentModeName()
    {
        try
        {
            if (_dm is { } dm && dm.GetCustomModes().TryGetValue(
                    dm.GetActiveModeId().ToString(System.Globalization.CultureInfo.InvariantCulture), out var mode))
            {
                return mode.Name.Length > 32 ? mode.Name[..32] : mode.Name;
            }
        }
        catch (Exception e)
        {
            Logger.LogDebug(e, "CarbonStealth: mode lookup failed");
        }
        return "dm";
    }

    /// <summary>Работа с базата извън игровата нишка; резултатът се връща в игровата нишка.</summary>
    private void RunDb<T>(Func<Task<T>> work, Action<T> onGameThread, string what, Action? onError = null)
    {
        _ = Task.Run(async () =>
        {
            try
            {
                var result = await work();
                Server.NextFrame(() => onGameThread(result));
            }
            catch (Exception e)
            {
                Logger.LogError(e, "CarbonStealth: {What} failed", what);
                if (onError is not null) Server.NextFrame(onError);
            }
        });
    }

    private void RunDb(Func<Task> work, string what, Action? onDone = null, Action? onError = null) =>
        RunDb(async () =>
        {
            await work();
            return true;
        }, _ => onDone?.Invoke(), what, onError);

    /// <summary>Едно и също съобщение до всички, всеки на своя език (!lang).</summary>
    private void Broadcast(string key, params object[] args)
    {
        foreach (var p in Utilities.GetPlayers().Where(p => p is { IsValid: true, IsBot: false }))
        {
            p.PrintToChat(Localizer.ForPlayer(p, key, args));
        }
    }

    private void Broadcast(Func<CCSPlayerController, string> message)
    {
        foreach (var p in Utilities.GetPlayers().Where(p => p is { IsValid: true, IsBot: false }))
        {
            p.PrintToChat(message(p));
        }
    }

    private string When(CCSPlayerController? player, DateTimeOffset? until) =>
        until is { } u ? u.UtcDateTime.ToString("yyyy-MM-dd HH:mm 'UTC'", System.Globalization.CultureInfo.InvariantCulture)
                       : Localizer.ForPlayer(player, "permanent");

    /// <summary>Изритване с текст. Текстът минава през конзолата → без кавички, „;“ и контролни знаци.</summary>
    private static void Kick(CCSPlayerController player, string message)
    {
        if (player.UserId is not { } userId) return;
        var clean = new string(message.Where(c => !char.IsControl(c) && c is not '"' and not ';').ToArray()).Trim();
        Server.ExecuteCommand($"kickid {userId} \"{clean}\"");
    }
}
