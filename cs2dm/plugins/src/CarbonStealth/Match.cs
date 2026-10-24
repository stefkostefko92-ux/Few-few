using CarbonStealth.Data;
using CarbonStealth.Logic;
using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Core.Translations;

namespace CarbonStealth;

/// <summary>
/// Картата на мача (CONTRACT.md §13): мач = една карта до смяната ѝ. Следим убийствата между хора;
/// в края (панелът с победителя или изтеклото време) — топ 3 в чата на езика на всеки играч, запис
/// в matches/match_players и линк към сайта. Смяна на картата без край (админ) — само запис.
/// Без MVP музика: тя е музикален кит (предмет) — червената линия на Valve.
/// </summary>
public sealed partial class CarbonStealthPlugin
{
    private readonly MatchTracker _match = new();

    private void RegisterMatch()
    {
        RegisterEventHandler<EventCsWinPanelMatch>((_, _) =>
        {
            FinishMatch(announce: true);
            return HookResult.Continue;
        });
    }

    private void BeginMatch() => _match.Begin(DateTimeOffset.UtcNow);

    private void FinishMatch(bool announce)
    {
        var now = DateTimeOffset.UtcNow;
        if (_match.Finish(now) is not { } summary) return;
        if (announce) AnnounceMatch(summary);
        if (_db is not { } db) return;
        var map = Server.MapName;
        var mode = CurrentModeName();
        var season = _seasonId;
        var eventId = _events.ActiveAt(now)?.Id;
        var xp = XpTenths();
        RunDb(() => db.SaveMatchAsync(summary, map, mode, season, eventId, xp), id =>
        {
            if (announce && id > 0) Broadcast("match.link", $"{Config.SiteUrl}/match/{id}");
        }, "match save");
    }

    private void AnnounceMatch(MatchSummary s)
    {
        foreach (var p in Utilities.GetPlayers().Where(p => p is { IsValid: true, IsBot: false }))
        {
            p.PrintToChat(Localizer.ForPlayer(p, "match.summary", s.Kills, s.Players.Count));
            foreach (var r in s.Players.Take(3))
            {
                p.PrintToChat(Localizer.ForPlayer(p, "match.line", r.Place, r.Name, r.Kills, r.Deaths, r.Headshots, r.BestStreak));
            }
        }
    }
}
