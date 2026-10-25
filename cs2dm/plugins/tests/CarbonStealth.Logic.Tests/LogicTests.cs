using System.Text.Json;
using CarbonStealth.Logic;
using Xunit;

namespace CarbonStealth.Logic.Tests;

public class ProgressionTests
{
    // Тестовите стойности от CONTRACT.md §3 — същите са и в приложението (TS).
    [Theory]
    [InlineData(0, 1)]
    [InlineData(99, 1)]
    [InlineData(100, 2)]
    [InlineData(299, 2)]
    [InlineData(300, 3)]
    [InlineData(599, 3)]
    [InlineData(600, 4)]
    [InlineData(4500, 10)]
    public void Нивото_следва_формулата_от_договора(long xp, int level) =>
        Assert.Equal(level, Progression.LevelFromXp(xp));

    [Fact]
    public void Нивото_е_монотонно_и_точно_на_всяка_граница()
    {
        for (var n = 1; n <= 200; n++)
        {
            Assert.Equal(n, Progression.LevelFromXp(Progression.XpForLevel(n)));
            if (n > 1) Assert.Equal(n - 1, Progression.LevelFromXp(Progression.XpForLevel(n) - 1));
        }
    }

    [Fact]
    public void XP_за_убийство_събира_всички_бонуси()
    {
        Assert.Equal(10, Progression.XpForKill(default));
        var all = new KillFacts(Headshot: true, Knife: true, Noscope: true, Wallbang: true, ThroughSmoke: true, Revenge: true, BountyClaimed: 75);
        Assert.Equal(10 + 5 + 20 + 10 + 5 + 5 + 5 + 75, Progression.XpForKill(all));
        Assert.Equal(10, Progression.XpForKill(new KillFacts(false, false, false, false, false, false, -50)));
    }

    // Същите стойности като botKillXp в levels.ts (tests/levels.test.ts).
    [Theory]
    [InlineData(10, 5)]
    [InlineData(15, 7)]
    [InlineData(45, 22)]
    [InlineData(1, 0)]
    [InlineData(0, 0)]
    [InlineData(-8, 0)]
    public void Убийство_на_бот_дава_половината_XP_надолу(int xp, int expected) =>
        Assert.Equal(expected, Progression.BotKillXp(xp));

    [Fact]
    public void Бот_с_двоен_XP_след_множителя() =>
        Assert.Equal(15, Progression.BotKillXp(Progression.ApplyMultiplier(15, 20)));

    [Theory]
    [InlineData(0, null)]
    [InlineData(99, null)]
    [InlineData(100, "Bronze")]
    [InlineData(1499, "Silver")]
    [InlineData(1500, "Gold")]
    [InlineData(10000, "Diamond")]
    public void Майсторство_по_прагове(int kills, string? tier) => Assert.Equal(tier, Progression.MasteryTier(kills));

    [Theory]
    [InlineData("weapon_ak47", "ak47")]
    [InlineData("ak47", "ak47")]
    [InlineData("weapon_knife_t", "knife")]
    [InlineData("knife_karambit", "knife")]
    [InlineData("bayonet", "knife")]
    public void Оръжията_се_нормализират(string raw, string normalized) =>
        Assert.Equal(normalized, Progression.NormalizeWeapon(raw));

    [Theory]
    [InlineData("weapon_ak47", true)]
    [InlineData("deagle", true)]
    [InlineData("weapon_knife", false)]
    [InlineData("hegrenade", false)]
    [InlineData("inferno", false)]
    [InlineData("taser", false)]
    [InlineData("", false)]
    public void Огнестрелни_за_точността(string weapon, bool gun) => Assert.Equal(gun, Progression.IsGun(weapon));

    [Fact]
    public void Снайперите_се_разпознават()
    {
        Assert.True(Progression.IsSniper("weapon_awp"));
        Assert.True(Progression.IsSniper("ssg08"));
        Assert.False(Progression.IsSniper("ak47"));
    }
}

public class StreakTests
{
    private const ulong A = 76561198000000001, B = 76561198000000002, C = 76561198000000003;

    [Theory]
    [InlineData(4, 0)]
    [InlineData(5, 25)]
    [InlineData(6, 50)]
    [InlineData(13, 225)]
    [InlineData(14, 250)]
    [InlineData(40, 250)]
    public void Баунти_по_серия(int streak, int bounty) => Assert.Equal(bounty, StreakTracker.BountyFor(streak));

    [Fact]
    public void Баунтито_се_взема_от_този_който_прекъсне_серията()
    {
        var t = new StreakTracker();
        for (var i = 0; i < 5; i++) t.RecordKill(A, C);
        Assert.Equal(25, t.BountyOn(A));
        var outcome = t.RecordKill(B, A);
        Assert.Equal(25, outcome.BountyClaimed);
        Assert.Equal(0, t.BountyOn(A));
        Assert.Equal(0, t.StreakOf(A));
        Assert.Equal(1, outcome.AttackerStreak);
    }

    [Fact]
    public void Баунтито_се_вдига_само_при_нов_праг()
    {
        var t = new StreakTracker();
        StreakOutcome last = default;
        for (var i = 0; i < 5; i++) last = t.RecordKill(A, C);
        Assert.True(last.BountyRaised);
        last = t.RecordKill(A, C);
        Assert.True(last.BountyRaised);
        Assert.Equal(50, last.NewBountyOnAttacker);
    }

    [Fact]
    public void Отмъщение_след_три_поредни_смърти_от_същия()
    {
        var t = new StreakTracker();
        t.RecordKill(A, B);
        t.RecordKill(A, B);
        Assert.False(t.RecordKill(B, A).Revenge); // само 2 подред
        t.RecordKill(A, B);
        t.RecordKill(A, B);
        t.RecordKill(A, B);
        Assert.True(t.RecordKill(B, A).Revenge);
        Assert.False(t.RecordKill(B, A).Revenge); // веригата е нулирана
    }

    [Fact]
    public void Самоубийството_изгаря_серията_и_баунтито()
    {
        var t = new StreakTracker();
        for (var i = 0; i < 6; i++) t.RecordKill(A, C);
        t.RecordDeath(A);
        Assert.Equal(0, t.StreakOf(A));
        Assert.Equal(0, t.BountyOn(A));
    }
}

public class RolesTests
{
    [Fact]
    public void Нивата_съвпадат_с_enum_в_схемата()
    {
        Assert.Equal(Role.Owner, Roles.Parse("OWNER"));
        Assert.Equal(Role.Player, Roles.Parse("PLAYER"));
        Assert.Equal(Role.Player, Roles.Parse(null));
        Assert.Equal(Role.Player, Roles.Parse("непознато"));
        Assert.Equal(7, (int)Role.Owner);
    }

    [Fact]
    public void Модераторът_бани_до_седем_дни_адмиът_без_ограничение()
    {
        Assert.True(Roles.Can(Role.Moderator, Roles.BanAction(TimeSpan.FromDays(7))));
        Assert.False(Roles.Can(Role.Moderator, Roles.BanAction(TimeSpan.FromDays(8))));
        Assert.False(Roles.Can(Role.Moderator, Roles.BanAction(null)));
        Assert.True(Roles.Can(Role.Admin, Roles.BanAction(null)));
        Assert.False(Roles.Can(Role.Helper, AdminAction.BanTemporary));
        Assert.True(Roles.Can(Role.Helper, AdminAction.Kick));
        Assert.False(Roles.Can(Role.Vip, AdminAction.Kick));
    }

    [Fact]
    public void Immunity_равен_или_по_висок_не_може_да_бъде_наказан()
    {
        Assert.True(Roles.CanTarget(Role.Admin, Role.Moderator));
        Assert.False(Roles.CanTarget(Role.Admin, Role.Admin));
        Assert.False(Roles.CanTarget(Role.Moderator, Role.Owner));
    }
}

public class DurationTests
{
    [Theory]
    [InlineData("30m", 30)]
    [InlineData("45", 45)]
    [InlineData("2h", 120)]
    [InlineData("7d", 10080)]
    [InlineData("1w", 10080)]
    [InlineData(" 3D ", 4320)]
    public void Продължителности(string input, int minutes)
    {
        Assert.True(Durations.TryParse(input, out var d));
        Assert.Equal(TimeSpan.FromMinutes(minutes), d);
    }

    [Theory]
    [InlineData("0")]
    [InlineData("perm")]
    [InlineData("PERMANENT")]
    public void Завинаги_е_null(string input)
    {
        Assert.True(Durations.TryParse(input, out var d));
        Assert.Null(d);
    }

    [Theory]
    [InlineData("")]
    [InlineData("-5")]
    [InlineData("5x")]
    [InlineData("abc")]
    [InlineData("99999w")]
    public void Невалидни_се_отказват(string input) => Assert.False(Durations.TryParse(input, out _));

    [Fact]
    public void Активно_наказание_по_правилото_на_договора()
    {
        var now = DateTimeOffset.UtcNow;
        Assert.True(Punishments.IsActive(null, null, now));
        Assert.True(Punishments.IsActive(now.AddMinutes(1), null, now));
        Assert.False(Punishments.IsActive(now.AddMinutes(-1), null, now));
        Assert.False(Punishments.IsActive(null, now.AddMinutes(-1), now));
    }
}

public class BridgeTests
{
    private static readonly byte[] Key = "test-key-0123456789abcdef0123456789"u8.ToArray();

    private static string Payload(string id, long ts, string action = "kick") =>
        JsonSerializer.Serialize(new { id, ts, actor = "76561198000000001", action, args = new { steamId = "76561198000000002", reason = "тест ü" } });

    [Fact]
    public void Валидна_команда_се_приема()
    {
        var now = DateTimeOffset.UtcNow;
        var msg = BridgeProtocol.Envelope(Payload("a1", now.ToUnixTimeMilliseconds()), Key);
        Assert.True(BridgeProtocol.TryOpen(msg, Key, now, new ReplayGuard(), out var cmd, out var err), err);
        Assert.Equal("kick", cmd!.Action);
        Assert.Equal("76561198000000002", cmd.Arg("steamId"));
        Assert.Equal("тест ü", cmd.Arg("reason"));
    }

    [Fact]
    public void Подменен_payload_се_отказва()
    {
        var now = DateTimeOffset.UtcNow;
        var msg = BridgeProtocol.Envelope(Payload("a2", now.ToUnixTimeMilliseconds()), Key).Replace("kick", "slay");
        Assert.False(BridgeProtocol.TryOpen(msg, Key, now, new ReplayGuard(), out _, out var err));
        Assert.Equal("bad signature", err);
    }

    [Fact]
    public void Друг_ключ_се_отказва()
    {
        var now = DateTimeOffset.UtcNow;
        var msg = BridgeProtocol.Envelope(Payload("a3", now.ToUnixTimeMilliseconds()), "друг-ключ"u8.ToArray());
        Assert.False(BridgeProtocol.TryOpen(msg, Key, now, new ReplayGuard(), out _, out _));
    }

    [Fact]
    public void Стара_команда_и_повторение_се_отказват()
    {
        var now = DateTimeOffset.UtcNow;
        var guard = new ReplayGuard();
        var stale = BridgeProtocol.Envelope(Payload("a4", now.AddMinutes(-2).ToUnixTimeMilliseconds()), Key);
        Assert.False(BridgeProtocol.TryOpen(stale, Key, now, guard, out _, out var e1));
        Assert.Equal("stale", e1);

        var fresh = BridgeProtocol.Envelope(Payload("a5", now.ToUnixTimeMilliseconds()), Key);
        Assert.True(BridgeProtocol.TryOpen(fresh, Key, now, guard, out _, out _));
        Assert.False(BridgeProtocol.TryOpen(fresh, Key, now, guard, out _, out var e2));
        Assert.Equal("replay", e2);
    }

    [Fact]
    public void Непознато_действие_и_боклук_се_отказват()
    {
        var now = DateTimeOffset.UtcNow;
        var bad = BridgeProtocol.Envelope(Payload("a6", now.ToUnixTimeMilliseconds(), "rcon"), Key);
        Assert.False(BridgeProtocol.TryOpen(bad, Key, now, new ReplayGuard(), out _, out _));
        Assert.False(BridgeProtocol.TryOpen("не е json", Key, now, new ReplayGuard(), out _, out var e));
        Assert.Equal("malformed envelope", e);
    }

    [Fact]
    public void Подписът_съвпада_с_Node_crypto_за_същия_низ()
    {
        // Стойността е сметната с Node:
        // node -e 'console.log(require("crypto").createHmac("sha256","k").update("{\"a\":\"б\"}").digest("hex"))'
        Assert.Equal("cbe3d618023a5e002fabbf60787c7c3eace0fed4d426c56cca26641d6ab481d7",
            BridgeProtocol.Sign("{\"a\":\"б\"}", "k"u8.ToArray()));
    }

    [Fact]
    public void ReplayGuard_забравя_най_старите()
    {
        var g = new ReplayGuard(capacity: 2);
        Assert.True(g.TryAccept("x"));
        Assert.True(g.TryAccept("y"));
        Assert.True(g.TryAccept("z"));
        Assert.True(g.TryAccept("x")); // „x“ е изместен
        Assert.False(g.TryAccept("z"));
    }
}

public class TextTests
{
    [Theory]
    [InlineData("Ivan", "Ivan")]
    [InlineData("\u0007Red\u0004Green", "RedGreen")]
    [InlineData("   ", "player")]
    [InlineData(null, "player")]
    [InlineData("{Red}Hacker", "(Red)Hacker")]
    public void Никът_се_чисти_от_цветови_кодове(string? input, string expected) => Assert.Equal(expected, Text.SafeName(input));

    [Fact]
    public void Чатът_се_чисти_и_реже()
    {
        Assert.Equal("здравей (Green)", Text.SafeText("здравей \u0004{Green}"));
        Assert.Equal(10, Text.SafeText(new string('x', 50), 10).Length);
        Assert.Equal("", Text.SafeText(null));
    }

    [Fact]
    public void Дълъг_ник_се_реже() => Assert.Equal(32, Text.SafeName(new string('a', 100)).Length);

    [Theory]
    [InlineData("76561198000000001", true)]
    [InlineData("7656119800000000", false)]
    [InlineData("86561198000000001", false)]
    [InlineData("7656119800000000x", false)]
    public void SteamID64(string s, bool ok) => Assert.Equal(ok, Text.IsSteamId64(s));
}

public class BannerTests
{
    [Fact]
    public void BannersNeedHeadAdmin()
    {
        Assert.False(Roles.Can(Role.Admin, AdminAction.Banners));
        Assert.True(Roles.Can(Role.HeadAdmin, AdminAction.Banners));
    }

    [Theory]
    [InlineData(1f, 0f, 90f)]    // стена с лице към +X → текстът с yaw 90
    [InlineData(0f, 1f, 180f)]
    [InlineData(-1f, 0f, 270f)]
    [InlineData(0f, -1f, 0f)]
    public void TextFacesOutOfTheWall(float nx, float ny, float yaw)
    {
        var p = BannerPlacement.OnWall(100f, 200f, 50f, nx, ny, 0f, model: false);
        Assert.NotNull(p);
        Assert.Equal(yaw, p.Value.Yaw, 3);
        Assert.Equal(0f, p.Value.Pitch);
        Assert.Equal(90f, p.Value.Roll);
        // Отместено от стената по нормалата.
        Assert.Equal(100f + nx * BannerPlacement.WallOffset, p.Value.X, 3);
        Assert.Equal(200f + ny * BannerPlacement.WallOffset, p.Value.Y, 3);
        Assert.Equal(50f, p.Value.Z);
    }

    [Fact]
    public void ModelFacesAlongTheNormal()
    {
        var p = BannerPlacement.OnWall(0f, 0f, 0f, 0f, 1f, 0.1f, model: true);
        Assert.NotNull(p);
        Assert.Equal(90f, p.Value.Yaw, 3);
        Assert.Equal(0f, p.Value.Roll);
    }

    [Theory]
    [InlineData(0f, 0f, 1f)]     // под
    [InlineData(0f, 0f, -1f)]    // таван
    [InlineData(0.5f, 0f, 0.8f)] // наклон
    public void FloorsAndSlopesAreRejected(float nx, float ny, float nz) =>
        Assert.Null(BannerPlacement.OnWall(0f, 0f, 0f, nx, ny, nz, model: false));

    [Fact]
    public void LinesAreCenteredAndGoDown()
    {
        var lines = BannerCatalog.Text["carbonstealth"].Lines;
        var tops = BannerPlacement.LineTops(lines);
        var h0 = lines[0].FontSize * BannerPlacement.UnitsPerPx;
        var h1 = lines[1].FontSize * BannerPlacement.UnitsPerPx;
        var total = h0 + h1 + h1 * BannerPlacement.LineGap;
        Assert.Equal(total / 2f, tops[0], 3);
        Assert.Equal(total / 2f - h0 - h1 * BannerPlacement.LineGap, tops[1], 3);
        // Долният ръб на последния ред е на −total/2 → блокът е центриран.
        Assert.Equal(-total / 2f, tops[1] - h1, 3);
    }

    [Theory]
    [InlineData("carbonstealth", true)]
    [InlineData("logo_1", true)]
    [InlineData("Logo", false)]
    [InlineData("", false)]
    [InlineData("a b", false)]
    [InlineData("abcdefghijklmnopqrstuvwxyz0123456", false)] // 33 знака
    public void BannerKeys(string key, bool valid) => Assert.Equal(valid, BannerCatalog.IsValidKey(key));

    [Fact]
    public void CatalogKeysAreValidAndFitTheEntityBudget()
    {
        foreach (var (key, banner) in BannerCatalog.Text)
        {
            Assert.True(BannerCatalog.IsValidKey(key));
            Assert.Equal(key, banner.Key);
            // point_worldtext пази до 512 байта UTF-8.
            Assert.All(banner.Lines, l => Assert.True(System.Text.Encoding.UTF8.GetByteCount(l.Text) < 512));
        }
    }

    [Fact]
    public void AdvertsRotateInOrder()
    {
        var r = new AdvertRotation(["a", "b", "c"]);
        Assert.Equal(new string?[] { "a", "b", "c", "a" }, new[] { r.Next(), r.Next(), r.Next(), r.Next() });
        Assert.Null(new AdvertRotation([]).Next());
    }
}

public class HudMenuTests
{
    private static HudPage Page(int n, Action? onSelect = null) =>
        new("T", "sub", Enumerable.Range(0, n).Select(i => new HudItem($"item {i}", onSelect, Disabled: i == 2)).ToList());

    [Fact]
    public void NavigationWrapsAround()
    {
        var s = new HudMenuSession(() => Page(4));
        s.Move(-1);
        s.Current(out var sel);
        Assert.Equal(3, sel);
        s.Move(1);
        s.Current(out sel);
        Assert.Equal(0, sel);
    }

    [Fact]
    public void SelectionIsClampedWhenTheListShrinks()
    {
        var count = 6;
        var s = new HudMenuSession(() => Page(count));
        s.Move(5);
        count = 3; // напр. играч излезе
        s.Current(out var sel);
        Assert.Equal(2, sel);
    }

    [Fact]
    public void DisabledAndInfoItemsDoNothing()
    {
        var hits = 0;
        var s = new HudMenuSession(() => Page(4, () => hits++));
        s.Move(2);
        Assert.Null(s.Selected());
        s.Move(1);
        s.Selected()!();
        Assert.Equal(1, hits);
        Assert.Null(new HudMenuSession(() => Page(1)).Selected());
    }

    [Fact]
    public void BackClosesOnlyAtTheRoot()
    {
        var s = new HudMenuSession(() => Page(1));
        s.Push(() => Page(2));
        s.Push(() => Page(3));
        Assert.True(s.Back());
        s.Home();
        Assert.Equal(1, s.Depth);
        Assert.False(s.Back());
    }

    [Theory]
    [InlineData(3, 0, 0, 3)]
    [InlineData(10, 0, 0, 5)]
    [InlineData(10, 4, 2, 7)]
    [InlineData(10, 9, 5, 10)]
    public void WindowFollowsTheSelection(int count, int selected, int start, int end) =>
        Assert.Equal((start, end), HudMenuSession.Window(count, selected));

    [Fact]
    public void PlayerTextIsEscaped()
    {
        var s = new HudMenuSession(() => new HudPage("<b>x</b>", "a'b", [new HudItem("<font color='red'>pwn</font>", null)]));
        var html = HudMenuRenderer.Render(s, "CS", "keys");
        Assert.DoesNotContain("<font color='red'>pwn", html);
        Assert.Contains("&lt;font color=&#39;red&#39;&gt;pwn", html);
        Assert.Contains("&lt;b&gt;x&lt;/b&gt;", html);
        Assert.Contains("a&#39;b", html);
    }

    [Fact]
    public void KeysFireOnPressThenRepeatWhileHeld()
    {
        const ulong w = 1 << 3, e = 1 << 5;
        var keys = new KeyRepeater(firstDelay: 0.3, interval: 0.1);
        var watched = new[] { w, e };
        var repeat = new HashSet<ulong> { w };
        Assert.Equal([w], keys.Pressed(w, 0.0, watched, repeat));
        Assert.Empty(keys.Pressed(w, 0.2, watched, repeat));          // още не
        Assert.Equal([w], keys.Pressed(w, 0.31, watched, repeat));    // повторение
        Assert.Empty(keys.Pressed(w, 0.35, watched, repeat));
        Assert.Equal([w], keys.Pressed(w, 0.42, watched, repeat));
        Assert.Equal([e], keys.Pressed(e, 0.5, watched, repeat));     // W пуснат, E натиснат
        Assert.Empty(keys.Pressed(e, 2.0, watched, repeat));          // E не се повтаря
    }

    [Fact]
    public void NewAdminActionsFollowTheRoleLadder()
    {
        Assert.True(Roles.Can(Role.Moderator, AdminAction.Announce));
        Assert.False(Roles.Can(Role.Moderator, AdminAction.Fun));
        Assert.True(Roles.Can(Role.Admin, AdminAction.Fun));
        Assert.True(Roles.Can(Role.Admin, AdminAction.Server));
        Assert.False(Roles.Can(Role.Admin, AdminAction.Noclip));
        Assert.True(Roles.Can(Role.HeadAdmin, AdminAction.Noclip));
    }
}
