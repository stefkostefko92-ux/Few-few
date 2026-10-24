using System.Globalization;
using CarbonStealth.Logic;
using CarbonStealth.State;
using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Core.Translations;
using Microsoft.Extensions.Logging;

namespace CarbonStealth;

/// <summary>
/// Командите от сайта (CONTRACT.md §5). Правата ги проверява сайтът (роля + одит), плъгинът вярва само
/// на валиден подпис. Всичко тук тече в игровата нишка; отговорът (ack) е задължителен.
/// </summary>
public sealed partial class CarbonStealthPlugin
{
    private void StartBridge()
    {
        if (string.IsNullOrWhiteSpace(Config.RedisConnection) || Config.BridgeKey.Length < 32)
        {
            Logger.LogWarning("CarbonStealth: web bridge disabled (RedisConnection empty or BridgeKey shorter than 32)");
            return;
        }
        var connection = Config.RedisConnection;
        var key = Config.BridgeKey;
        _ = Task.Run(async () =>
        {
            try
            {
                var client = await BridgeClient.ConnectAsync(connection, key, Logger, OnBridgeCommand);
                Server.NextFrame(() =>
                {
                    // Плъгинът е спрян междувременно → връзката не е нужна.
                    if (_db is null)
                    {
                        _ = client.DisposeAsync().AsTask();
                        return;
                    }
                    _bridge = client;
                    Logger.LogInformation("CarbonStealth: web bridge connected");
                });
            }
            catch (Exception e)
            {
                Logger.LogError(e, "CarbonStealth: web bridge connect failed (needs abortConnect=false)");
            }
        });
    }

    private void OnBridgeCommand(BridgeCommand cmd, Action<bool, string?> done)
    {
        switch (cmd.Action)
        {
            case "kick":
                BridgeKick(cmd, done);
                break;
            case "punish":
                BridgePunish(cmd, done);
                break;
            case "revoke":
                BridgeRevoke(cmd, done);
                break;
            case "say":
                var text = Text.SafeText(cmd.Arg("text"));
                if (text.Length == 0) { done(false, "empty text"); return; }
                Broadcast("admin.say", text);
                done(true, null);
                break;
            case "slay":
                if (Online(cmd.Arg("steamId")) is not { } victim) { done(false, "not online"); return; }
                victim.Player.PlayerPawn.Value?.CommitSuicide(false, true);
                Broadcast(p => Localizer.ForPlayer(p, "admin.slayed", victim.State.Name, Localizer.ForPlayer(p, "panel.actor")));
                done(true, null);
                break;
            case "reload":
                // Роли, VIP и наказания идват заедно в snapshot-а → едно презареждане покрива и трите.
                RefreshOnlinePlayers();
                done(true, null);
                break;
            case "mode":
                BridgeMode(cmd, done);
                break;
            default:
                done(false, "unknown action");
                break;
        }
    }

    private (CCSPlayerController Player, PlayerState State)? Online(string? steamId)
    {
        if (steamId is null || !Text.IsSteamId64(steamId)) return null;
        var state = _players.All.FirstOrDefault(s => s.SteamId64 == steamId);
        return state is not null && Utilities.GetPlayerFromSlot(state.Slot) is { IsValid: true } p ? (p, state) : null;
    }

    private void BridgeKick(BridgeCommand cmd, Action<bool, string?> done)
    {
        if (Online(cmd.Arg("steamId")) is not { } t) { done(false, "not online"); return; }
        var reason = Text.SafeText(cmd.Arg("reason"), 200);
        Broadcast(p => Localizer.ForPlayer(p, "admin.kicked", t.State.Name, Localizer.ForPlayer(p, "panel.actor")));
        Kick(t.Player, reason.Length > 0 ? reason : "Kicked by an admin");
        done(true, null);
    }

    /// <summary>Наказанието вече е записано от сайта: зареждаме го и го прилагаме, ако човекът е онлайн.</summary>
    private void BridgePunish(BridgeCommand cmd, Action<bool, string?> done)
    {
        if (!TryId(cmd.Arg("punishmentId"), out var id) || _db is not { } db) { done(false, "bad punishmentId"); return; }
        RunDb(() => db.LoadPunishmentAsync(id), loaded =>
        {
            if (loaded is not { } l) { done(false, "not active"); return; }
            if (Online(l.SteamId) is not { } t) { done(true, null); return; }
            var p = l.Punishment;
            var now = DateTimeOffset.UtcNow;
            switch (p.Type)
            {
                case "BAN":
                    Kick(t.Player, Localizer.ForPlayer(t.Player, "banned", Localizer.ForPlayer(t.Player, $"category.{p.Category}"),
                        When(t.Player, p.ExpiresAt), $"{Config.SiteUrl}/bans"));
                    break;
                case "KICK":
                    Kick(t.Player, "Kicked by an admin");
                    break;
                case "MUTE" or "GAG" or "SILENCE":
                    t.State.Punishments.RemoveAll(x => x.Id == p.Id);
                    t.State.Punishments.Add(p);
                    ApplyVoice(t.Player, t.State, now);
                    t.Player.PrintToChat(Localizer.ForPlayer(t.Player, $"you.{p.Type}", When(t.Player, p.ExpiresAt)));
                    break;
                case "WARN":
                    t.Player.PrintToChat(Localizer.ForPlayer(t.Player, "you.WARN", Config.SiteUrl));
                    break;
            }
            done(true, null);
        }, "bridge punish", () => done(false, "database error"));
    }

    private void BridgeRevoke(BridgeCommand cmd, Action<bool, string?> done)
    {
        if (!TryId(cmd.Arg("punishmentId"), out var id)) { done(false, "bad punishmentId"); return; }
        var now = DateTimeOffset.UtcNow;
        foreach (var s in _players.All.Where(s => s.Punishments.Any(p => p.Id == id)).ToList())
        {
            s.Punishments.RemoveAll(p => p.Id == id);
            if (Utilities.GetPlayerFromSlot(s.Slot) is { IsValid: true } player) ApplyVoice(player, s, now);
        }
        done(true, null);
    }

    private void BridgeMode(BridgeCommand cmd, Action<bool, string?> done)
    {
        if (_dm is not { } dm) { done(false, "deathmatch api unavailable"); return; }
        if (!TryId(cmd.Arg("modeId"), out var modeId)) { done(false, "bad modeId"); return; }
        try
        {
            dm.StartCustomMode(modeId);
            done(true, null);
        }
        catch (Exception e)
        {
            // DM плъгинът хвърля при несъществуващ режим — съобщението му не излиза навън.
            Logger.LogWarning(e, "CarbonStealth: mode {Mode} failed", modeId);
            done(false, "unknown mode");
        }
    }

    private static bool TryId(string? s, out int id) =>
        int.TryParse(s, NumberStyles.None, CultureInfo.InvariantCulture, out id) && id >= 0;
}
