using System.Drawing;
using System.Globalization;
using CarbonStealth.Data;
using CarbonStealth.Logic;
using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Core.Translations;
using CounterStrikeSharp.API.Modules.Commands;
using CounterStrikeSharp.API.Modules.Utils;
using Microsoft.Extensions.Logging;

namespace CarbonStealth;

/// <summary>
/// Банерите в картата. Текстовите (point_worldtext) работят веднага; картинките са модели от
/// Workshop addon-а (cs2dm/addon/), заредени през MultiAddonManager — без addon ключът им се пропуска.
/// Ентитетите изчезват при смяна на рунд/карта → пресъздават се при round_start.
/// </summary>
public sealed partial class CarbonStealthPlugin
{
    private static readonly Color PlateColor = Color.FromArgb(215, 12, 12, 16);
    private const float MaxRemoveDistance = 160f;

    private BannerStore? _bannerStore;
    private List<StoredBanner> _banners = [];
    private readonly List<uint> _bannerEntities = [];

    private void RegisterBanners()
    {
        _bannerStore = _db is { } db ? new BannerStore(db.Source) : null;
        RegisterListener<Listeners.OnServerPrecacheResources>(manifest =>
        {
            foreach (var model in Config.BannerModels.Values) manifest.AddResource(model);
        });
        RegisterListener<Listeners.OnMapStart>(LoadBanners);
        RegisterListener<Listeners.OnMapEnd>(() =>
        {
            _bannerEntities.Clear();
            _banners = [];
        });
        RegisterEventHandler<EventRoundStart>((_, _) =>
        {
            Server.NextFrame(RespawnBanners);
            return HookResult.Continue;
        });
        if (Server.MapName is { Length: > 0 } map) LoadBanners(map);
    }

    private void LoadBanners(string map)
    {
        if (_bannerStore is not { } store) return;
        RunDb(() => store.ListAsync(map), list =>
        {
            if (Server.MapName != map) return;
            _banners = list;
            RespawnBanners();
        }, "banners");
    }

    private void RespawnBanners()
    {
        RemoveBannerEntities();
        foreach (var b in _banners) SpawnBanner(b);
    }

    /// <summary>Също при unload — иначе презареждане на плъгина оставя втори комплект в картата.</summary>
    private void RemoveBannerEntities()
    {
        foreach (var raw in _bannerEntities)
        {
            if (new CHandle<CBaseEntity>(raw).Value is { IsValid: true } e) e.Remove();
        }
        _bannerEntities.Clear();
    }

    private void SpawnBanner(StoredBanner b)
    {
        var p = b.Placement;
        var angles = new QAngle(p.Pitch, p.Yaw, p.Roll);
        if (BannerCatalog.Text.TryGetValue(b.Key, out var text))
        {
            var tops = BannerPlacement.LineTops(text.Lines);
            for (var i = 0; i < text.Lines.Count; i++)
            {
                var line = text.Lines[i];
                var pos = new Vector(p.X, p.Y, p.Z + tops[i]);
                var pad = line.FontSize * BannerPlacement.UnitsPerPx * BannerPlacement.LineGap;
                SpawnText(new string(' ', line.Text.Length), line.FontSize, PlateColor, pos, angles, plate: pad);
                SpawnText(line.Text, line.FontSize, Color.FromArgb(255, line.R, line.G, line.B), pos, angles, plate: null);
            }
        }
        else if (Config.BannerModels.TryGetValue(b.Key, out var model))
        {
            var prop = Utilities.CreateEntityByName<CDynamicProp>("prop_dynamic_override");
            if (prop is null) return;
            // Само за гледане: без колизия, за да не спира куршуми и хора.
            prop.Collision.SolidType = SolidType_t.SOLID_NONE;
            prop.Teleport(new Vector(p.X, p.Y, p.Z), angles);
            prop.DispatchSpawn();
            prop.SetModel(model);
            _bannerEntities.Add(prop.EntityHandle.Raw);
        }
    }

    /// <summary>Един ред. С <paramref name="plate"/> е тъмната плоча отзад (маскиран текст + фон).</summary>
    private void SpawnText(string message, int fontSize, Color color, Vector pos, QAngle angles, float? plate)
    {
        var ent = Utilities.CreateEntityByName<CPointWorldText>("point_worldtext");
        if (ent is null) return;
        ent.MessageText = message;
        ent.Enabled = true;
        ent.FontName = "Arial Bold";
        ent.FontSize = fontSize;
        ent.Color = color;
        ent.Fullbright = true;
        ent.WorldUnitsPerPx = BannerPlacement.UnitsPerPx;
        ent.JustifyHorizontal = PointWorldTextJustifyHorizontal_t.POINT_WORLD_TEXT_JUSTIFY_HORIZONTAL_CENTER;
        ent.JustifyVertical = PointWorldTextJustifyVertical_t.POINT_WORLD_TEXT_JUSTIFY_VERTICAL_TOP;
        ent.ReorientMode = PointWorldTextReorientMode_t.POINT_WORLD_TEXT_REORIENT_NONE;
        if (plate is { } pad)
        {
            ent.DrawBackground = true;
            ent.BackgroundBorderWidth = 6f;
            ent.BackgroundBorderHeight = pad;
            ent.BackgroundWorldToUV = 0.05f;
            ent.DepthOffset = -0.0015f;
        }
        ent.Teleport(pos, angles);
        ent.DispatchSpawn();
        _bannerEntities.Add(ent.EntityHandle.Raw);
    }

    /// <summary>!banner [add &lt;ключ&gt; | remove [id] | list] — HEADADMIN+, гледаш към стена.</summary>
    private void CmdBanner(CCSPlayerController? actor, CommandInfo info)
    {
        if (actor is null) { Tell(null, "banner.ingame"); return; }
        if (!Roles.Can(ActorRole(actor), AdminAction.Banners)) { Tell(actor.Slot, "no.permission"); return; }
        if (_bannerStore is not { } store) return;
        var map = Server.MapName;
        var sub = info.ArgCount > 1 ? info.GetArg(1).ToLowerInvariant() : "";
        switch (sub)
        {
            case "add" when info.ArgCount > 2:
                AddBanner(actor, store, map, info.GetArg(2).ToLowerInvariant());
                break;
            case "remove" or "del":
                RemoveBanner(actor, store, map, info.ArgCount > 2 ? info.GetArg(2) : null);
                break;
            case "list":
                foreach (var b in _banners)
                {
                    actor.PrintToChat(Localizer.ForPlayer(actor, "banner.item", b.Id, b.Key,
                        (int)Distance(actor, b.Placement)));
                }
                if (_banners.Count == 0) Tell(actor.Slot, "banner.none");
                break;
            default:
                Tell(actor.Slot, "banner.usage", string.Join(", ", BannerKeys()));
                break;
        }
    }

    private IEnumerable<string> BannerKeys() =>
        BannerCatalog.Text.Keys.Concat(Config.BannerModels.Keys).Distinct().Order(StringComparer.Ordinal);

    private void AddBanner(CCSPlayerController actor, BannerStore store, string map, string key)
    {
        var isText = BannerCatalog.Text.ContainsKey(key);
        if (!isText && !Config.BannerModels.ContainsKey(key))
        {
            Tell(actor.Slot, "banner.unknown", Text.SafeText(key, 32), string.Join(", ", BannerKeys()));
            return;
        }
        if (actor.PlayerPawn.Value is not { IsValid: true } pawn || pawn.AbsOrigin is not { } origin) return;
        var eye = new Vector(origin.X, origin.Y, origin.Z + pawn.ViewOffset.Z);
        var hit = Trace.TraceShape(eye, pawn.EyeAngles, pawn,
            new TraceOptions { InteractsWith = Contents.Solid | Contents.Window });
        var placement = hit.DidHit() && !hit.IsAllSolid
            ? BannerPlacement.OnWall(hit.HitPoint.X, hit.HitPoint.Y, hit.HitPoint.Z,
                hit.Normal.X, hit.Normal.Y, hit.Normal.Z, model: !isText)
            : null;
        if (placement is not { } p) { Tell(actor.Slot, "banner.nowall"); return; }

        var slot = actor.Slot;
        var actorId = ActorId(actor);
        RunDb(() => store.AddAsync(map, key, p, actorId), id =>
        {
            if (Server.MapName != map) return;
            var banner = new StoredBanner(id, key, p);
            _banners.Add(banner);
            SpawnBanner(banner);
            Tell(slot, "banner.added", id, key);
            Logger.LogInformation("CarbonStealth: banner {Id} ({Key}) added on {Map} by {Actor}", id, key, map, actorId);
        }, "banner add", () => Tell(slot, "db.error"));
    }

    /// <summary>По id или най-близкия до играча (в радиус <see cref="MaxRemoveDistance"/>).</summary>
    private void RemoveBanner(CCSPlayerController actor, BannerStore store, string map, string? idArg)
    {
        StoredBanner? target;
        if (idArg is not null)
        {
            target = int.TryParse(idArg, NumberStyles.None, CultureInfo.InvariantCulture, out var id)
                ? _banners.FirstOrDefault(b => b.Id == id)
                : null;
        }
        else
        {
            target = _banners.MinBy(b => Distance(actor, b.Placement));
            if (target is not null && Distance(actor, target.Placement) > MaxRemoveDistance) target = null;
        }
        if (target is null) { Tell(actor.Slot, "banner.none"); return; }

        var slot = actor.Slot;
        var actorId = ActorId(actor);
        RunDb(() => store.RemoveAsync(target.Id, map, actorId), removed =>
        {
            _banners.RemoveAll(b => b.Id == target.Id);
            RespawnBanners();
            Tell(slot, removed ? "banner.removed" : "banner.none", target.Id);
        }, "banner remove", () => Tell(slot, "db.error"));
    }

    private static float Distance(CCSPlayerController actor, Placement p)
    {
        if (actor.PlayerPawn.Value?.AbsOrigin is not { } o) return float.MaxValue;
        var (dx, dy, dz) = (o.X - p.X, o.Y - p.Y, o.Z - p.Z);
        return MathF.Sqrt(dx * dx + dy * dy + dz * dz);
    }
}
