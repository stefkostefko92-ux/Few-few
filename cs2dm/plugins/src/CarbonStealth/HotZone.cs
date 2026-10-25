using System.Drawing;
using System.Globalization;
using CarbonStealth.Data;
using CarbonStealth.Logic;
using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Core.Translations;
using CounterStrikeSharp.API.Modules.Commands;
using CounterStrikeSharp.API.Modules.Timers;
using CounterStrikeSharp.API.Modules.Utils;
using Microsoft.Extensions.Logging;

namespace CarbonStealth;

/// <summary>
/// „Горещата зона“ (CONTRACT.md §15): на всеки N минути (CS2DM_HOTZONE_EVERY) за 3 минути една точка дава
/// двойно XP на убиеца вътре. Зоните са от `!zone add` (HEADADMIN+, одит); без тях — най-гъстият клъстер
/// убийства за 7 дни (секторът от heatmap-а). Маркерът е point_worldtext над центъра — светът го закрива,
/// през стени не се вижда. „Крал на зоната“ (най-много убийства на хора вътре, поне 3) получава значка.
/// </summary>
public sealed partial class CarbonStealthPlugin
{
    private static readonly Color ZoneColor = Color.FromArgb(255, 255, 122, 24);
    private const float ZoneMarkerHeight = 110f;
    private const int ZoneMarkerFont = 72;

    private HotZoneClock _zoneClock = new(0);
    private readonly HotZoneRound _zoneRound = new();
    private List<HotZoneSpot> _zones = [];
    private HotZoneSpot? _zoneFallback;
    private HotZoneSpot? _zoneActive;
    private int _zoneTurn;
    private uint? _zoneMarker;

    private void RegisterHotZone()
    {
        _zoneClock = new HotZoneClock(Config.HotZoneEveryMinutes * 60);
        AddCommand("css_zone", "Hot zones on this map (HEADADMIN+)", (p, i) => CmdZone(p, i));
        RegisterListener<Listeners.OnMapStart>(map =>
        {
            _zoneMarker = null;
            _zoneActive = null;
            _zoneRound.Clear();
            _zones = [];
            _zoneFallback = null;
            _zoneTurn = 0;
            _zoneClock.Reset(Server.CurrentTime);
            LoadZones(map);
        });
        RegisterListener<Listeners.OnMapEnd>(() =>
        {
            // Ентитетите падат с картата — маркерът само се забравя; кралят на прекъснатата зона се записва.
            _zoneMarker = null;
            EndZone(announce: false);
        });
        // Нов рунд чисти ентитетите на картата (както банерите) → маркерът се слага наново.
        RegisterEventHandler<EventRoundStart>((_, _) =>
        {
            Server.NextFrame(() =>
            {
                if (_zoneActive is { } zone) SpawnZoneMarker(zone);
            });
            return HookResult.Continue;
        });
        if (_zoneClock.Enabled) AddTimer(1f, TickHotZone, TimerFlags.REPEAT);
        if (Server.MapName is { Length: > 0 } current) LoadZones(current);
    }

    private void LoadZones(string map)
    {
        if (_db is not { } db) return;
        var now = DateTimeOffset.UtcNow;
        RunDb(async () => (await db.ListZonesAsync(map), map == Dust2Grid.Map ? await db.DensestZoneAsync(now) : null),
            loaded =>
            {
                if (Server.MapName != map) return;
                (_zones, _zoneFallback) = loaded;
            }, "zones");
    }

    private void TickHotZone()
    {
        var now = Server.CurrentTime;
        // Празен сървър: часовникът чака — първата зона идва цял интервал след първия човек.
        if (!_zoneClock.Active && !AnyHuman())
        {
            _zoneClock.Reset(now);
            return;
        }
        switch (_zoneClock.Tick(now))
        {
            case ZonePhase.Started:
                StartZone(now);
                break;
            case ZonePhase.Warned when _zoneActive is { } zone:
                Announce(p => Localizer.ForPlayer(p, "zone.warn", zone.Name, HotZoneRules.WarnSeconds),
                    p => Localizer.ForPlayer(p, "hud.zone.warn", zone.Name, HotZoneRules.WarnSeconds));
                break;
            case ZonePhase.Ended:
                EndZone(announce: true);
                break;
            default:
                // Часовникът е почнал отначало (времето на играта е тръгнало назад) — зоната спира тихо.
                if (!_zoneClock.Active && _zoneActive is not null) EndZone(announce: false);
                break;
        }
    }

    private void StartZone(double now)
    {
        if (HotZoneRules.Pick(_zones, _zoneFallback, _zoneTurn++) is not { } zone)
        {
            // Няма зони и още няма достатъчно убийства за резервната — следващ опит след интервала.
            _zoneClock.Reset(now);
            return;
        }
        _zoneActive = zone;
        _zoneRound.Clear();
        SpawnZoneMarker(zone);
        Announce(p => Localizer.ForPlayer(p, "zone.start", zone.Name, Progression.HotZoneMultiplier,
                HotZoneRules.ActiveSeconds / 60),
            p => Localizer.ForPlayer(p, "hud.zone.start", zone.Name, Progression.HotZoneMultiplier));
    }

    private void EndZone(bool announce)
    {
        if (_zoneActive is not { } zone) return;
        _zoneActive = null;
        RemoveZoneMarker();
        var king = _zoneRound.King();
        _zoneRound.Clear();
        if (announce)
        {
            Announce(p => Localizer.ForPlayer(p, "zone.end", zone.Name),
                p => Localizer.ForPlayer(p, "hud.zone.end", zone.Name));
            if (king is not null) Broadcast("zone.king", king.Name, king.Kills, zone.Name);
            else Broadcast("zone.noking", HotZoneRules.KingMinKills);
        }
        if (king is null || _db is not { } db) return;
        var details = new { map = Server.MapName, zone = zone.Name, kills = king.Kills };
        RunDb(() => db.AddBadgeAsync(king.SteamId, ZoneStore.ZoneKingBadge, details), "zone badge");
    }

    /// <summary>Убиецът е в активната зона (по позицията на пешката му в момента на убийството).</summary>
    private bool InHotZone(CCSPlayerController? player) =>
        _zoneActive is { } zone && player?.PlayerPawn.Value?.AbsOrigin is { } o && HotZoneRules.Contains(zone, o.X, o.Y, o.Z);

    private void SpawnZoneMarker(HotZoneSpot zone)
    {
        RemoveZoneMarker();
        var ent = Utilities.CreateEntityByName<CPointWorldText>("point_worldtext");
        if (ent is null) return;
        ent.MessageText = $"HOT ZONE · {zone.Name}";
        ent.Enabled = true;
        ent.FontName = "Arial Bold";
        ent.FontSize = ZoneMarkerFont;
        ent.Color = ZoneColor;
        ent.Fullbright = true;
        ent.WorldUnitsPerPx = BannerPlacement.UnitsPerPx;
        ent.JustifyHorizontal = PointWorldTextJustifyHorizontal_t.POINT_WORLD_TEXT_JUSTIFY_HORIZONTAL_CENTER;
        ent.JustifyVertical = PointWorldTextJustifyVertical_t.POINT_WORLD_TEXT_JUSTIFY_VERTICAL_BOTTOM;
        // Обръща се към всеки зрител около вертикалата; без DepthOffset — дълбочината е като на света.
        ent.ReorientMode = PointWorldTextReorientMode_t.POINT_WORLD_TEXT_REORIENT_AROUND_UP;
        ent.Teleport(new Vector(zone.X, zone.Y, zone.Z + ZoneMarkerHeight), new QAngle(0, 0, 90));
        ent.DispatchSpawn();
        _zoneMarker = ent.EntityHandle.Raw;
    }

    /// <summary>Също при unload — иначе презареждане на плъгина оставя маркер в картата.</summary>
    private void RemoveZoneMarker()
    {
        if (_zoneMarker is { } raw && new CHandle<CBaseEntity>(raw).Value is { IsValid: true } e) e.Remove();
        _zoneMarker = null;
    }

    /// <summary>!zone add &lt;име&gt; [радиус] | remove &lt;id&gt; | list — HEADADMIN+, центърът е там, където стоиш.</summary>
    private void CmdZone(CCSPlayerController? actor, CommandInfo info)
    {
        if (actor is null) { Tell(null, "zone.ingame"); return; }
        if (!Roles.Can(ActorRole(actor), AdminAction.Banners)) { Tell(actor.Slot, "no.permission"); return; }
        if (_db is not { } db) return;
        var map = Server.MapName;
        var sub = info.ArgCount > 1 ? info.GetArg(1).ToLowerInvariant() : "";
        switch (sub)
        {
            case "add" when info.ArgCount > 2:
                AddZone(actor, db, map, Enumerable.Range(2, info.ArgCount - 2).Select(info.GetArg).ToList());
                break;
            case "remove" or "del" when info.ArgCount > 2:
                RemoveZone(actor, db, map, info.GetArg(2));
                break;
            case "list":
                foreach (var z in _zones)
                {
                    actor.PrintToChat(Localizer.ForPlayer(actor, "zone.item", z.Id, z.Name, z.Radius, (int)ZoneDistance(actor, z)));
                }
                if (_zones.Count == 0 && _zoneFallback is { } f) Tell(actor.Slot, "zone.fallback", f.Name);
                else if (_zones.Count == 0) Tell(actor.Slot, "zone.none");
                break;
            default:
                Tell(actor.Slot, "zone.usage", HotZoneRules.MinRadius, HotZoneRules.MaxRadius, HotZoneRules.DefaultRadius);
                break;
        }
    }

    private void AddZone(CCSPlayerController actor, Database db, string map, IReadOnlyList<string> args)
    {
        if (HotZoneRules.ParseAdd(args) is not { } parsed)
        {
            Tell(actor.Slot, "zone.usage", HotZoneRules.MinRadius, HotZoneRules.MaxRadius, HotZoneRules.DefaultRadius);
            return;
        }
        if (actor.PlayerPawn.Value is not { IsValid: true, LifeState: (byte)LifeState_t.LIFE_ALIVE } pawn
            || pawn.AbsOrigin is not { } o)
        {
            Tell(actor.Slot, "zone.alive");
            return;
        }
        var (name, radius) = parsed;
        var (x, y, z) = (o.X, o.Y, o.Z);
        var slot = actor.Slot;
        var actorId = ActorId(actor);
        RunDb(() => db.AddZoneAsync(map, name, x, y, z, radius, actorId), id =>
        {
            if (Server.MapName != map) return;
            _zones.Add(new HotZoneSpot(id, name, x, y, z, radius));
            Tell(slot, "zone.added", id, name, radius);
            Logger.LogInformation("CarbonStealth: zone {Id} ({Name}) added on {Map} by {Actor}", id, name, map, actorId);
        }, "zone add", () => Tell(slot, "db.error"));
    }

    private void RemoveZone(CCSPlayerController actor, Database db, string map, string idArg)
    {
        if (!int.TryParse(idArg, NumberStyles.None, CultureInfo.InvariantCulture, out var id))
        {
            Tell(actor.Slot, "zone.none");
            return;
        }
        var slot = actor.Slot;
        var actorId = ActorId(actor);
        RunDb(() => db.RemoveZoneAsync(id, map, actorId), removed =>
        {
            if (Server.MapName == map) _zones.RemoveAll(z => z.Id == id);
            Tell(slot, removed ? "zone.removed" : "zone.none", id);
        }, "zone remove", () => Tell(slot, "db.error"));
    }

    private static float ZoneDistance(CCSPlayerController actor, HotZoneSpot z)
    {
        if (actor.PlayerPawn.Value?.AbsOrigin is not { } o) return float.MaxValue;
        var (dx, dy, dz) = (o.X - z.X, o.Y - z.Y, o.Z - z.Z);
        return MathF.Sqrt(dx * dx + dy * dy + dz * dz);
    }
}
