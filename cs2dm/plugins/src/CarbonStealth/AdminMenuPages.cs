using System.Globalization;
using CarbonStealth.Logic;
using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Core.Translations;
using CounterStrikeSharp.API.Modules.Cvars;

namespace CarbonStealth;

/// <summary>Подстраниците на WASD менюто: срокове, причини, потвърждение, сървър, обявления, банери.</summary>
public sealed partial class CarbonStealthPlugin
{
    private static readonly int[] SlapDamage = [0, 10, 25, 50];
    private static readonly int[] BotQuotas = [0, 4, 8, 10, 12, 16];
    private static readonly string[] AnnounceKeys = ["announce.welcome", "announce.rules", "announce.report", "announce.restart", "announce.site"];

    private HudItem BackItem(int slot) => new(L(slot, "hud.back"), () => Hud(slot)?.Back());

    /// <summary>Действие, след което менюто се връща в началото.</summary>
    private Action Done(int slot, Action run) => () =>
    {
        run();
        Hud(slot)?.Home();
    };

    private HudPage SlapPage(int slot, int uid)
    {
        var items = SlapDamage.Select(d => new HudItem(L(slot, "hud.slap.dmg", d), () =>
        {
            // Остава на страницата — може да се шамаросва поред.
            if (Utilities.GetPlayers().FirstOrDefault(p => p is { IsValid: true } && p.UserId == uid) is { } t)
            {
                Slap(Utilities.GetPlayerFromSlot(slot), t, d);
            }
        }, d >= 25 ? HudTone.Danger : HudTone.Normal)).ToList();
        items.Add(BackItem(slot));
        return new HudPage(L(slot, "hud.slap"), null, items);
    }

    private HudPage ReasonPage(int slot, string titleKey, Action<string> run)
    {
        var items = ReasonKeys.Select(k => new HudItem(L(slot, k), Done(slot, () => run(k == "hud.reason.none" ? "" : L(slot, k))))).ToList();
        items.Add(BackItem(slot));
        return new HudPage(L(slot, titleKey), L(slot, "hud.reason"), items);
    }

    /// <param name="ban">При бан модераторът вижда само това, което може да даде (до 7 дни).</param>
    private HudPage DurationPage(int slot, string titleKey, string[] options, bool ban, Action<TimeSpan?> next)
    {
        var role = ActorRole(Utilities.GetPlayerFromSlot(slot));
        var items = new List<HudItem>();
        foreach (var o in options)
        {
            if (!Durations.TryParse(o, out var d) || (ban && !Roles.Can(role, Roles.BanAction(d)))) continue;
            var label = d is null ? L(slot, "permanent") : Durations.Describe(d);
            items.Add(new HudItem(label, ban ? () => next(d) : Done(slot, () => next(d)), d is null ? HudTone.Danger : HudTone.Normal));
        }
        items.Add(BackItem(slot));
        return new HudPage(L(slot, titleKey), L(slot, "hud.duration"), items);
    }

    private HudPage CategoryPage(int slot, Action<string> next)
    {
        var items = MenuCategories.Select(c => new HudItem(L(slot, $"category.{c}"), () => next(c))).ToList();
        items.Add(BackItem(slot));
        return new HudPage(L(slot, "hud.ban"), L(slot, "hud.category"), items);
    }

    private HudPage ConfirmPage(int slot, string title, string question, Action onYes) =>
        new(title, question,
        [
            new HudItem(L(slot, "hud.yes"), Done(slot, onYes), HudTone.Danger),
            new HudItem(L(slot, "hud.no"), () => Hud(slot)?.Back()),
        ]);

    private HudPage ServerPage(int slot)
    {
        var items = new List<HudItem>();
        if (_dm is not null) items.Add(new(L(slot, "hud.mode"), () => Push(slot, () => ModesPage(slot)), Detail: CurrentModeName()));
        var bots = ConVar.Find("bot_quota")?.GetPrimitiveValue<int>();
        items.Add(new(L(slot, "hud.bots"), () => Push(slot, () => BotsPage(slot)), Detail: bots?.ToString(CultureInfo.InvariantCulture)));
        items.Add(new(L(slot, "hud.ammo"), () => SetInfiniteAmmo(slot, !_infiniteAmmo), Detail: L(slot, _infiniteAmmo ? "hud.on" : "hud.off")));
        items.Add(new(L(slot, "hud.restart"), () => Push(slot, () => ConfirmPage(slot, L(slot, "hud.restart"), L(slot, "hud.restart.q"),
            () => RestartGame(Utilities.GetPlayerFromSlot(slot)))), HudTone.Danger));
        items.Add(BackItem(slot));
        return new HudPage(L(slot, "hud.server"), $"{Server.MapName} · {CurrentModeName()}", items);
    }

    private HudPage ModesPage(int slot)
    {
        var items = new List<HudItem>();
        if (_dm is { } dm)
        {
            var active = dm.GetActiveModeId();
            foreach (var (key, mode) in dm.GetCustomModes().OrderBy(m => m.Key, StringComparer.Ordinal))
            {
                if (!int.TryParse(key, NumberStyles.None, CultureInfo.InvariantCulture, out var id)) continue;
                var name = mode.Name;
                items.Add(new HudItem(name, () => Push(slot, () => ConfirmPage(slot, L(slot, "hud.mode"), name,
                    () => StartMode(Utilities.GetPlayerFromSlot(slot), id, name))),
                    id == active ? HudTone.Good : HudTone.Normal, id == active ? L(slot, "hud.mode.active") : null));
            }
        }
        items.Add(BackItem(slot));
        return new HudPage(L(slot, "hud.mode"), null, items);
    }

    private HudPage BotsPage(int slot)
    {
        var items = BotQuotas.Select(n => new HudItem(n.ToString(CultureInfo.InvariantCulture), Done(slot, () =>
        {
            Server.ExecuteCommand($"bot_quota {n}");
            var actor = Utilities.GetPlayerFromSlot(slot);
            Broadcast("server.bots", ActorName(actor), n);
            // Същият ред като в панела (§11) — иначе следващото опресняване на 60 s връща старото.
            _settings = _settings with { BotQuota = n };
            SaveSetting(actor, "bots", new { quota = n });
        }))).ToList();
        items.Add(BackItem(slot));
        return new HudPage(L(slot, "hud.bots"), null, items);
    }

    private HudPage AnnouncePage(int slot)
    {
        var items = AnnounceKeys.Select(k => new HudItem(L(slot, k, Config.SiteUrl), Done(slot, () =>
            AnnounceLocalized(Utilities.GetPlayerFromSlot(slot), k)))).ToList();
        items.Add(new HudItem(L(slot, "hud.csay.hint"), null, Disabled: true));
        items.Add(BackItem(slot));
        return new HudPage(L(slot, "hud.announce"), null, items);
    }

    private HudPage BannersPage(int slot)
    {
        var me = Utilities.GetPlayerFromSlot(slot);
        var items = new List<HudItem> { new(L(slot, "hud.banner.add"), () => Push(slot, () => BannerAddPage(slot)), HudTone.Good) };
        foreach (var b in _banners.OrderBy(b => me is null ? 0 : Distance(me, b.Placement)))
        {
            var id = b.Id;
            var meters = me is null ? "" : $"{(int)(Distance(me, b.Placement) / 52.5f)} m";
            items.Add(new HudItem($"#{id} {b.Key}", () => Push(slot, () => ConfirmPage(slot, L(slot, "hud.banner.remove"), $"#{id} {b.Key}",
                () =>
                {
                    if (Utilities.GetPlayerFromSlot(slot) is { } a && _bannerStore is { } store)
                    {
                        RemoveBanner(a, store, Server.MapName, id.ToString(CultureInfo.InvariantCulture));
                    }
                })), Detail: meters));
        }
        items.Add(BackItem(slot));
        return new HudPage(L(slot, "hud.banners"), Server.MapName, items);
    }

    private HudPage BannerAddPage(int slot)
    {
        var items = BannerKeys().Select(k => new HudItem(k, Done(slot, () =>
        {
            if (Utilities.GetPlayerFromSlot(slot) is { } a && _bannerStore is { } store) AddBanner(a, store, Server.MapName, k);
        }))).ToList();
        items.Add(BackItem(slot));
        return new HudPage(L(slot, "hud.banner.add"), L(slot, "hud.banner.aim"), items);
    }

    private void StartMode(CCSPlayerController? actor, int id, string name)
    {
        try
        {
            _dm?.StartCustomMode(id);
        }
        catch (Exception)
        {
            Tell(SlotOf(actor), "db.error");
            return;
        }
        Broadcast("server.mode", ActorName(actor), name);
        Audit(actor, "server.mode", null, new { id, name });
    }

    private void RestartGame(CCSPlayerController? actor)
    {
        Server.ExecuteCommand("mp_restartgame 3");
        Broadcast("server.restart", ActorName(actor));
        Audit(actor, "server.restartgame", null, new { });
    }

    private void SetInfiniteAmmo(int slot, bool on)
    {
        _infiniteAmmo = on;
        _settings = _settings with { InfiniteAmmo = on };
        var actor = Utilities.GetPlayerFromSlot(slot);
        Broadcast("server.ammo", ActorName(actor), L(slot, on ? "hud.on" : "hud.off"));
        SaveSetting(actor, "ammo", new { infiniteReserve = on });
    }

    /// <summary>Обявление по ключ — всеки го вижда на своя език.</summary>
    private void AnnounceLocalized(CCSPlayerController? actor, string key)
    {
        var from = HudMenuRenderer.Escape(ActorName(actor));
        foreach (var p in Utilities.GetPlayers().Where(p => p is { IsValid: true, IsBot: false }))
        {
            var text = Localizer.ForPlayer(p, key, Config.SiteUrl);
            if (!_huds.ContainsKey(p.Slot))
            {
                p.PrintToCenterHtml($"<font color='{HudMenuRenderer.Gold}' class='fontSize-l'><b>{HudMenuRenderer.Escape(text)}</b></font>"
                                    + $"<br><font color='{HudMenuRenderer.Muted}'>— {from}</font>", 6);
            }
            p.PrintToChat(Localizer.ForPlayer(p, "admin.say", text));
        }
        Audit(actor, "server.announce", null, new { key });
    }
}
