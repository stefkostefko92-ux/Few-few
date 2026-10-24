using System.Globalization;
using CarbonStealth.Logic;
using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Core.Translations;
using CounterStrikeSharp.API.Modules.Cvars;
using CounterStrikeSharp.API.Modules.Timers;

namespace CarbonStealth;

/// <summary>
/// Картата се презарежда с края на мача: mp_timelimit 30 („Game Length“ в Deathmatch.json) +
/// mp_match_end_changelevel 1 — играчите остават свързани, картата, ботовете и рундът започват наново.
/// Тук само предупреждаваме (чат + център) 60 и 10 s преди и записваме статистиките преди смяната.
/// </summary>
public sealed partial class CarbonStealthPlugin
{
    private static readonly int[] MatchEndWarnings = [60, 10];
    private readonly HashSet<int> _matchWarned = [];
    private float _matchStart = float.NaN;
    private CCSGameRulesProxy? _rulesProxy;

    private void RegisterMatchEnd()
    {
        RegisterListener<Listeners.OnMapStart>(_ => _rulesProxy = null);
        RegisterListener<Listeners.OnMapEnd>(() =>
        {
            _mapEndedAt = DateTimeOffset.UtcNow;
            // Смяна на картата без край на мача (админ) — мачът се записва без обява.
            FinishMatch(announce: false);
            FlushStats();
        });
        AddTimer(1f, CheckMatchEnd, TimerFlags.REPEAT);
    }

    private void CheckMatchEnd()
    {
        if (GameRulesNow() is not { } rules || rules.WarmupPeriod || TimeLimitSeconds() is not { } limit) return;
        if (rules.GameStartTime != _matchStart)
        {
            _matchStart = rules.GameStartTime;
            _matchWarned.Clear();
            // Нов мач (нова карта или рестарт на играта) — картата на мача почва отначало (§13).
            BeginMatch();
        }
        var left = (int)Math.Ceiling(limit - (Server.CurrentTime - rules.GameStartTime));
        if (left <= 0)
        {
            // Резерв, ако панелът с победителя не дойде: времето изтече → краят на мача.
            FinishMatch(announce: true);
            return;
        }
        // Едно съобщение дори да са „дошли“ и двата прага (напр. плъгинът е зареден 5 s преди края).
        var due = false;
        foreach (var at in MatchEndWarnings)
        {
            if (left <= at && _matchWarned.Add(at)) due = true;
        }
        if (due) WarnMapReload(left);
    }

    private void WarnMapReload(int seconds)
    {
        foreach (var p in Utilities.GetPlayers().Where(p => p is { IsValid: true, IsBot: false }))
        {
            p.PrintToChat(Localizer.ForPlayer(p, "reload.warn", seconds));
            if (_huds.ContainsKey(p.Slot)) continue;
            var text = HudMenuRenderer.Escape(Localizer.ForPlayer(p, "hud.reload", seconds));
            p.PrintToCenterHtml($"<font color='{HudMenuRenderer.Gold}' class='fontSize-l'><b>{text}</b></font>", 5);
        }
    }

    /// <summary>mp_timelimit в секунди; 0 или липса → мачът няма край.</summary>
    private static double? TimeLimitSeconds()
    {
        // StringValue чете всеки тип cvar — не залагаме дали в този билд mp_timelimit е float или int.
        var raw = ConVar.Find("mp_timelimit")?.StringValue;
        return double.TryParse(raw, NumberStyles.Float, CultureInfo.InvariantCulture, out var minutes) && minutes > 0
            ? minutes * 60
            : null;
    }

    private CCSGameRules? GameRulesNow()
    {
        if (_rulesProxy is not { IsValid: true })
        {
            _rulesProxy = Utilities.FindAllEntitiesByDesignerName<CCSGameRulesProxy>("cs_gamerules").FirstOrDefault();
        }
        return _rulesProxy?.GameRules;
    }
}
