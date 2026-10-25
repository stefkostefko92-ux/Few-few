using CarbonStealth.Data;
using CarbonStealth.Logic;
using CounterStrikeSharp.API.Core;

namespace CarbonStealth;

/// <summary>
/// `!cup` — седмичната купа (CONTRACT.md §17): мястото ти и първите трима в текущата седмица (по DisplayTimeZone, като
/// мисиите). Мачът се брои, когато свърши. Значките в края на седмицата дава работникът на сайта, не плъгинът.
/// Заявката е една на 5 s на играч — `!cup` не може да натовари базата.
/// </summary>
public sealed partial class CarbonStealthPlugin
{
    private static readonly TimeSpan CupCooldown = TimeSpan.FromSeconds(5);
    private readonly Dictionary<ulong, DateTimeOffset> _cupAsked = new();

    private void RegisterCup()
    {
        AddCommand("css_cup", "Weekly cup: your place and the top 3", (p, _) => CmdCup(p));
        RegisterListener<Listeners.OnClientDisconnect>(slot =>
        {
            foreach (var id in _cupAsked.Where(kv => DateTimeOffset.UtcNow - kv.Value > CupCooldown).Select(kv => kv.Key).ToList())
            {
                _cupAsked.Remove(id);
            }
        });
    }

    private void CmdCup(CCSPlayerController? actor)
    {
        if (_db is not { } db) return;
        var slot = actor?.Slot;
        var me = actor is null ? null : _players.BySlot(actor.Slot);
        if (actor is not null && me is not { Loaded: true })
        {
            Tell(slot, "not.ready");
            return;
        }
        var now = DateTimeOffset.UtcNow;
        if (me is not null)
        {
            if (_cupAsked.TryGetValue(me.SteamId, out var last) && now - last < CupCooldown) return;
            _cupAsked[me.SteamId] = now;
        }
        var myId = me?.SteamId64 ?? "";
        var week = CupRules.WeekOf(now, _dayZone);
        RunDb(() => db.CupStandingsAsync(myId, week), rows =>
        {
            var left = week.End - DateTimeOffset.UtcNow;
            Tell(slot, "cup.head", Math.Max(0, (int)left.TotalDays), Math.Max(0, left.Hours));
            var top = rows.Where(r => r.Place <= CupRules.Podium).ToList();
            if (top.Count == 0) Tell(slot, "cup.empty");
            foreach (var r in top) Tell(slot, "cup.line", r.Place, Text.SafeName(r.Name), r.Xp);
            if (me is not null)
            {
                if (rows.FirstOrDefault(r => r.SteamId == myId) is not { } mine) Tell(slot, "cup.youNone");
                else if (mine.Place > CupRules.Podium) Tell(slot, "cup.you", mine.Place, mine.Xp);
            }
            Tell(slot, "cup.foot", Config.SiteUrl);
        }, "cup");
    }
}
