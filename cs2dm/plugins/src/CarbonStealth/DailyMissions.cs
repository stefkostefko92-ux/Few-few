using CarbonStealth.Data;
using CarbonStealth.Logic;
using CarbonStealth.State;
using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Core.Translations;
using Microsoft.Extensions.Logging;

namespace CarbonStealth;

/// <summary>
/// Мисиите за деня (CONTRACT.md §16): три на играч (лесна · средна · трудна), избрани детерминистично по SteamID64
/// и местната дата (`DisplayTimeZone`, като DISPLAY_TZ на сайта). Броят само убийствата между хора, спечелените
/// дуели и изиграните минути. Изпълнена мисия → XP наведнъж (без множител, като дуела), съобщение на играча и
/// ред в чата за всички. Напредъкът е в паметта (`MissionBook`), пише се на партиди с таймера на статистиките.
/// Книгата на играча остава и след излизане до края на деня — повторно влизане (и смяна на картата) не я чете
/// наново от базата, иначе незаписаната партида би дала мисията втори път.
/// </summary>
public sealed partial class CarbonStealthPlugin
{
    private readonly Dictionary<ulong, MissionBook> _missions = new();
    private MissionBatch _missionBatch = new();
    private bool _missionFlushing;
    private TimeZoneInfo _dayZone = TimeZoneInfo.Utc;

    private void RegisterMissions()
    {
        var (zone, error) = MissionPool.ResolveZone(Config.DisplayTimeZone);
        _dayZone = zone;
        if (error is not null) Logger.LogWarning("CarbonStealth: {Error} — mission days use {Zone}", error, zone.Id);
        AddCommand("css_missions", "Today's missions and your progress", (p, _) => CmdMissions(p));
        AddCommand("css_m", "Today's missions (short for !missions)", (p, _) => CmdMissions(p));
    }

    private DateOnly Today() => MissionPool.DayOf(DateTimeOffset.UtcNow, _dayZone);

    /// <summary>След snapshot-а при влизане: книгата от паметта (същия ден) или от базата; липсващите редове се пишат.</summary>
    private void StartMissions(int slot, PlayerState state)
    {
        var day = Today();
        if (_missions.TryGetValue(state.SteamId, out var kept) && kept.Day == day) return;
        if (_db is not { } db) return;
        var steamId = state.SteamId;
        RunDb(() => db.LoadMissionsAsync(state.SteamId64, day), saved =>
        {
            if (_players.BySlot(slot) is not { } s || s.SteamId != steamId) return;
            if (_missions.TryGetValue(steamId, out var current) && current.Day == day) return;
            var book = new MissionBook(s.SteamId64, day, saved);
            _missions[steamId] = book;
            var stored = saved.Select(r => r.Key).ToHashSet(StringComparer.Ordinal);
            foreach (var m in book.Slots.Where(m => !stored.Contains(m.Def.Key)))
            {
                _missionBatch.Put(MissionRow.Of(s.SteamId64, day, m));
            }
        }, "missions load");
    }

    /// <summary>Книгата за днес; нов ден → нови мисии (записват се веднага). null = още не е заредена.</summary>
    private MissionBook? BookOf(PlayerState s)
    {
        if (!_missions.TryGetValue(s.SteamId, out var book)) return null;
        var today = Today();
        if (book.Day == today) return book;
        book = new MissionBook(s.SteamId64, today, []);
        _missions[s.SteamId] = book;
        foreach (var m in book.Slots) _missionBatch.Put(MissionRow.Of(s.SteamId64, today, m));
        if (_players.BySlot(s.Slot) == s) Tell(s.Slot, "missions.new");
        return book;
    }

    private void OnMissionKill(CCSPlayerController attacker, PlayerState a, MissionKill kill)
    {
        if (BookOf(a) is { } book) ApplyMissions(attacker, a, book, book.RecordKill(kill, DateTimeOffset.UtcNow));
    }

    private void OnMissionDuelWin(CCSPlayerController player, PlayerState s)
    {
        if (BookOf(s) is { } book) ApplyMissions(player, s, book, book.RecordDuelWin(DateTimeOffset.UtcNow));
    }

    /// <summary>Изиграните секунди (таймерът и излизането). Излязъл играч взема XP-то, но без съобщения.</summary>
    private void OnMissionPlaytime(PlayerState s, int seconds)
    {
        if (BookOf(s) is not { } book) return;
        var player = _players.BySlot(s.Slot) == s ? Utilities.GetPlayerFromSlot(s.Slot) : null;
        ApplyMissions(player, s, book, book.RecordPlaySeconds(seconds, DateTimeOffset.UtcNow));
    }

    private void ApplyMissions(CCSPlayerController? player, PlayerState s, MissionBook book, MissionUpdate update)
    {
        foreach (var slot in update.Changed) _missionBatch.Put(MissionRow.Of(s.SteamId64, book.Day, slot));
        if (update.Completed.Count == 0) return;
        var online = player is { IsValid: true };
        var levelBefore = s.Level;
        foreach (var slot in update.Completed)
        {
            var xp = slot.Def.Xp;
            s.Xp += xp;
            Delta(s).Xp += xp;
            _match.AddXp(s.SteamId64, s.Name, xp);
            if (online) player!.PrintToChat(Localizer.ForPlayer(player, "missions.done", MissionText(player, slot.Def), xp));
            foreach (var p in Utilities.GetPlayers().Where(p => p is { IsValid: true, IsBot: false } && p.Slot != s.Slot))
            {
                p.PrintToChat(Localizer.ForPlayer(p, "missions.doneAll", s.Name, MissionText(p, slot.Def)));
            }
        }
        if (book.AllDone)
        {
            _missionBatch.StreakChecks.Add((s.SteamId64, book.Day));
            if (online) player!.PrintToChat(Localizer.ForPlayer(player, "missions.allDone"));
        }
        if (online) AnnounceLevelUp(player!, s, levelBefore);
    }

    private string MissionText(CCSPlayerController? player, MissionDef def) =>
        Localizer.ForPlayer(player, $"mission.{def.KindKey}", def.Target);

    private void CmdMissions(CCSPlayerController? actor)
    {
        if (actor is null)
        {
            Tell(null, "missions.ingame");
            return;
        }
        if (_players.BySlot(actor.Slot) is not { Loaded: true } s || BookOf(s) is not { } book)
        {
            Tell(actor.Slot, "not.ready");
            return;
        }
        Tell(actor.Slot, "missions.head", book.DoneCount, MissionPool.PerDay);
        foreach (var slot in book.Slots)
        {
            if (slot.Done) Tell(actor.Slot, "missions.lineDone", MissionText(actor, slot.Def), slot.Def.Xp);
            else Tell(actor.Slot, "missions.line", MissionText(actor, slot.Def), slot.Progress, slot.Def.Target, slot.Def.Xp);
        }
        Tell(actor.Slot, "missions.foot", _dayZone.Id, Config.SiteUrl);
    }

    /// <summary>С таймера на статистиките; при грешка партидата се връща. Старите книги на излезлите се махат.</summary>
    private void FlushMissions()
    {
        var today = Today();
        foreach (var id in _missions.Where(kv => kv.Value.Day != today && _players.BySteamId(kv.Key) is null)
                     .Select(kv => kv.Key).ToList())
        {
            _missions.Remove(id);
        }
        if (_missionFlushing || _db is not { } db || _missionBatch.IsEmpty) return;
        var batch = _missionBatch;
        _missionBatch = new MissionBatch();
        _missionFlushing = true;
        RunDb(() => db.FlushMissionsAsync(batch), awarded =>
        {
            _missionFlushing = false;
            foreach (var (steamId, days) in awarded)
            {
                if (PlayerOf(steamId) is { } p && _players.BySlot(p.Slot) is { } s) Broadcast("missions.streak", s.Name, days);
            }
        }, "missions flush", onError: () =>
        {
            _missionBatch.Merge(batch);
            _missionFlushing = false;
        });
    }
}
