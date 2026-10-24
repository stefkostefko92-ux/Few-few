using System.Text.Json;
using CarbonStealth.Data;
using CarbonStealth.Logic;
using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Core.Translations;
using CounterStrikeSharp.API.Modules.Cvars;
using CounterStrikeSharp.API.Modules.Timers;
using Microsoft.Extensions.Logging;

namespace CarbonStealth;

/// <summary>
/// Живите настройки (CONTRACT.md §11) и рекламите в чата. Настройките идват от server_settings при старт,
/// на 60 s и при „settings.reload“ от моста; без ред важи конфигът на плъгина. Реклама — една на интервал,
/// всеки на своя език; собствените текстове от панела са на bg/en.
/// </summary>
public sealed partial class CarbonStealthPlugin
{
    private ServerSettings _settings = ServerSettings.FromConfig(240, true);
    private CounterStrikeSharp.API.Modules.Timers.Timer? _advertTimer;
    private int _advertTimerSeconds = -1;
    private AdvertRotation _adverts = new([]);
    private IReadOnlyList<string> _advertSlots = [];
    private string _invalidSettings = "";

    private ServerSettings ConfigSettings() => ServerSettings.FromConfig(Config.AdvertSeconds, Config.InfiniteReserveAmmo);

    private void RegisterSettings()
    {
        ApplySettings(ConfigSettings());
        LoadSettings(null);
        AddTimer(60f, () => LoadSettings(null), TimerFlags.REPEAT);
        // gamemode cfg-то се изпълнява при всяко зареждане на картата и връща своя bot_quota.
        RegisterListener<Listeners.OnMapStart>(_ => AddTimer(5f, ApplyBotQuota));
    }

    /// <param name="done">true = прочетено и приложено (ack към панела).</param>
    private void LoadSettings(Action<bool>? done)
    {
        if (_db is not { } db)
        {
            done?.Invoke(false);
            return;
        }
        RunDb(db.LoadSettingsAsync, rows =>
        {
            var invalid = new List<string>();
            ApplySettings(ServerSettings.Parse(rows, ConfigSettings(), invalid));
            var text = string.Join(",", invalid);
            if (text != _invalidSettings && text.Length > 0)
            {
                Logger.LogWarning("CarbonStealth: server_settings rows {Keys} are invalid — plugin config applies", text);
            }
            _invalidSettings = text;
            done?.Invoke(true);
        }, "settings", () => done?.Invoke(false));
    }

    private void ApplySettings(ServerSettings next)
    {
        _settings = next;
        _infiniteAmmo = next.InfiniteAmmo;
        var slots = AdvertPlan.Slots(next.Adverts);
        if (!slots.SequenceEqual(_advertSlots, StringComparer.Ordinal))
        {
            _advertSlots = slots;
            _adverts = new AdvertRotation(slots);
        }
        if (next.Adverts.IntervalSec != _advertTimerSeconds) RestartAdvertTimer(next.Adverts.IntervalSec);
        ApplyBotQuota();
    }

    private void ApplyBotQuota()
    {
        if (_settings.BotQuota is not { } quota) return;
        if (ConVar.Find("bot_quota")?.GetPrimitiveValue<int>() != quota) Server.ExecuteCommand($"bot_quota {quota}");
    }

    private void RestartAdvertTimer(int seconds)
    {
        _advertTimer?.Kill();
        _advertTimer = null;
        _advertTimerSeconds = seconds;
        if (seconds > 0) _advertTimer = AddTimer(seconds, ShowNextAdvert, TimerFlags.REPEAT);
    }

    private void ShowNextAdvert()
    {
        if (_adverts.Next() is not { } slot) return;
        if (!AdvertPlan.TryCustomIndex(slot, out var index))
        {
            Broadcast(slot, Config.SiteUrl);
            return;
        }
        var adverts = _settings.Adverts;
        foreach (var p in Utilities.GetPlayers().Where(p => p is { IsValid: true, IsBot: false }))
        {
            if (AdvertPlan.CustomText(adverts, index, IsBulgarian(p)) is { } text) p.PrintToChat(Localizer.ForPlayer(p, "advert.custom", text));
        }
    }

    /// <summary>Множителят на XP в десети за убийство сега: max(настройката, текущото събитие) — CONTRACT §3.</summary>
    private int XpTenths() => EventTracker.EffectiveXpTenths(_settings.XpTenths, _events.ActiveAt(DateTimeOffset.UtcNow));

    private static bool IsBulgarian(CCSPlayerController player) =>
        player.GetLanguage().TwoLetterISOLanguageName == "bg";

    /// <summary>Превключвател от WASD менюто → същият ред в server_settings, който пише панелът (+ одит).</summary>
    private void SaveSetting(CCSPlayerController? actor, string key, object value)
    {
        if (_db is not { } db) return;
        var actorId = ActorId(actor);
        var json = JsonSerializer.Serialize(value);
        var slot = SlotOf(actor);
        RunDb(() => db.SaveSettingAsync(key, json, actorId), "settings save", onError: () => Tell(slot, "db.error"));
    }
}
