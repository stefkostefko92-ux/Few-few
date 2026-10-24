using CarbonStealth.Data;
using CarbonStealth.Logic;
using CarbonStealth.State;
using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Core.Translations;
using CounterStrikeSharp.API.Modules.Entities;
using CounterStrikeSharp.API.Modules.Utils;

namespace CarbonStealth;

public sealed partial class CarbonStealthPlugin
{
    /// <summary>
    /// При смяна на картата CSS „изключва“ всички (OnLevelEnd) и те се свързват наново. Такъв играч не е
    /// нов: без поздрав и без проверка за пълен сървър. Пазим само излизанията около края на картата.
    /// </summary>
    private static readonly TimeSpan MapChangeWindow = TimeSpan.FromMinutes(2);
    private readonly Dictionary<ulong, DateTimeOffset> _mapChangeLeaves = new();
    private DateTimeOffset _mapEndedAt = DateTimeOffset.MinValue;

    private void OnClientAuthorized(int slot, SteamID steamId)
    {
        var player = Utilities.GetPlayerFromSlot(slot);
        if (player is not { IsValid: true } || player.IsBot || _db is not { } db) return;

        var name = Text.SafeName(player.PlayerName);
        var state = _players.Add(steamId.SteamId64, slot, name);
        var ip = StripPort(player.IpAddress);
        var carried = _mapChangeLeaves.Remove(state.SteamId, out var left) && DateTimeOffset.UtcNow - left < MapChangeWindow;
        RunDb(() => db.OnConnectAsync(state.SteamId64, name, ip),
            snapshot => ApplySnapshot(slot, state.SteamId, snapshot, isConnect: true, carried), "connect");
    }

    private void OnClientDisconnect(int slot)
    {
        DropHud(slot);
        var state = _players.Remove(slot);
        if (state is null) return;
        var now = DateTimeOffset.UtcNow;
        if (now - _mapEndedAt < MapChangeWindow)
        {
            foreach (var old in _mapChangeLeaves.Where(kv => now - kv.Value >= MapChangeWindow).Select(kv => kv.Key).ToList())
            {
                _mapChangeLeaves.Remove(old);
            }
            _mapChangeLeaves[state.SteamId] = now;
        }
        AccruePlaytime(state);
        _streaks.Forget(state.SteamId);
        _bridge?.Event("leave", new { steamId = state.SteamId64, name = state.Name });
        if (_db is { } db && state.SessionId is { } sessionId)
        {
            var seconds = (int)(DateTimeOffset.UtcNow - state.ConnectedAt).TotalSeconds;
            RunDb(() => db.CloseSessionAsync(sessionId, state.SteamId64, seconds), "disconnect");
        }
    }

    /// <summary>Прилага роля/VIP/XP/наказания. Играчът може вече да е излязъл — тогава нищо.</summary>
    /// <param name="carried">Свърза се наново заради смяна на картата (не е нов на сървъра).</param>
    private void ApplySnapshot(int slot, ulong steamId, PlayerSnapshot snapshot, bool isConnect, bool carried = false)
    {
        var state = _players.BySlot(slot);
        if (state is null || state.SteamId != steamId) return;
        var player = Utilities.GetPlayerFromSlot(slot);
        if (player is not { IsValid: true }) return;

        var now = DateTimeOffset.UtcNow;
        state.Role = snapshot.Role;
        state.VipUntil = snapshot.VipUntil;
        switch (StatsEpochs.Compare(state.StatsEpoch, snapshot.StatsEpoch))
        {
            case EpochChange.Newer:
                // Панелът е редактирал статистиките (§3): базата е меродавна, натрупаното — изхвърлено.
                _batch.Discard(state.SteamId64);
                state.StatsEpoch = snapshot.StatsEpoch;
                state.Xp = snapshot.Xp;
                break;
            case EpochChange.Same:
                state.Xp = Math.Max(state.Xp, snapshot.Xp);
                break;
            case EpochChange.Stale:
                break;
        }
        state.Punishments = snapshot.Punishments;
        if (snapshot.SessionId is { } sid) state.SessionId = sid;
        state.Loaded = true;

        if (state.Active("BAN", now) is { } ban)
        {
            Kick(player, Localizer.ForPlayer(player, "banned",
                Localizer.ForPlayer(player, $"category.{ban.Category}"), When(player, ban.ExpiresAt), $"{Config.SiteUrl}/bans"));
            return;
        }

        if (isConnect && !carried && Config.PublicSlots > 0 && HumansOnline() > Config.PublicSlots
            && !state.IsVip(now) && state.Role < Role.Helper)
        {
            Kick(player, Localizer.ForPlayer(player, "server.full"));
            return;
        }

        ApplyVoice(player, state, now);
        ApplyTag(player, state, now);

        if (isConnect)
        {
            if (!carried && _settings.Welcome)
            {
                player.PrintToChat(Localizer.ForPlayer(player, "welcome", state.Name, Config.SiteUrl));
                TellActiveEvent(player);
            }
            _bridge?.Event("join", new { steamId = state.SteamId64, name = state.Name });
        }
    }

    /// <summary>На 60 s: роли, VIP и наказания на всички онлайн (хваща промени от сайта и без моста).</summary>
    private void RefreshOnlinePlayers()
    {
        if (_db is not { } db) return;
        foreach (var state in _players.All.Where(s => s.Loaded).ToList())
        {
            var slot = state.Slot;
            var steamId = state.SteamId;
            RunDb(() => db.ReloadAsync(state.SteamId64), snap => ApplySnapshot(slot, steamId, snap, isConnect: false), "reload");
        }
    }

    private static void ApplyVoice(CCSPlayerController player, PlayerState state, DateTimeOffset now) =>
        player.VoiceFlags = state.VoiceBlock(now) is null ? VoiceFlags.Normal : VoiceFlags.Muted;

    /// <summary>Таг в таблицата (позволено от Valve: промени по scoreboard и имената — не ранг на CS).</summary>
    private static void ApplyTag(CCSPlayerController player, PlayerState state, DateTimeOffset now)
    {
        var tag = state.Role switch
        {
            Role.Owner => "[OWNER]",
            Role.HeadAdmin or Role.Admin => "[ADMIN]",
            Role.Moderator => "[MOD]",
            Role.Helper => "[HELPER]",
            _ when state.IsVip(now) => "[VIP]",
            _ => $"[Lv {state.Level}]",
        };
        if (player.Clan == tag) return;
        player.Clan = tag;
        Utilities.SetStateChanged(player, "CCSPlayerController", "m_szClan");
    }

    private int HumansOnline() => Utilities.GetPlayers().Count(p => p is { IsValid: true, IsBot: false });

    /// <summary>Добавя изиграното време от последното отчитане до сега (таймер и излизане).</summary>
    private void AccruePlaytime(PlayerState state)
    {
        var now = DateTimeOffset.UtcNow;
        var seconds = (int)(now - state.AccruedUntil).TotalSeconds;
        if (seconds <= 0) return;
        state.AccruedUntil = now;
        Delta(state).PlaytimeSec += seconds;
    }

    private void AccruePlaytime()
    {
        foreach (var state in _players.All.Where(s => s.Loaded)) AccruePlaytime(state);
    }

    private static string? StripPort(string? address)
    {
        if (string.IsNullOrEmpty(address)) return null;
        var i = address.LastIndexOf(':');
        var ip = i > 0 ? address[..i] : address;
        return System.Net.IPAddress.TryParse(ip, out _) ? ip : null;
    }
}
