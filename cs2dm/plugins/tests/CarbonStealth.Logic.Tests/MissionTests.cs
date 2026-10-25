using CarbonStealth.Logic;
using Xunit;

namespace CarbonStealth.Logic.Tests;

/// <summary>Мисиите за деня (CONTRACT §16): изборът е като в TS (същите вектори в app/tests/missions.test.ts).</summary>
public class MissionTests
{
    private const string Player = "76561198000000001";
    private static readonly DateOnly Day = new(2026, 10, 25);
    private static readonly DateTimeOffset T0 = new(2026, 10, 25, 18, 0, 0, TimeSpan.Zero);

    private static MissionKill Kill(string weapon = "ak47", bool hs = false, bool knife = false, bool wall = false,
        bool smoke = false, bool noscope = false, int streak = 1, bool zone = false, bool wanted = false) =>
        new(weapon, hs, knife, wall, smoke, noscope, streak, zone, wanted);

    [Theory]
    [InlineData("", 2166136261u)]
    [InlineData("a", 3826002220u)]
    [InlineData("foobar", 3214735720u)]
    [InlineData("76561198000000001:2026-10-25:0", 4140767131u)]
    public void FNV1a_32_известните_вектори(string text, uint hash) => Assert.Equal(hash, MissionPool.Fnv1a(text));

    [Theory]
    [InlineData("76561198000000001", "2026-10-25", "pistol_10", "minutes_60", "headshots_50")]
    [InlineData("76561198000000001", "2026-10-26", "headshots_10", "headshots_25", "wanted_1")]
    [InlineData("76561190000986101", "2026-10-25", "pistol_10", "headshots_25", "headshots_50")]
    [InlineData("76561197960265728", "2026-03-29", "smg_10", "zone_3", "streak_10")]
    public void Изборът_е_детерминистичен_по_една_от_трудност(string steamId, string day, string easy, string medium, string hard)
    {
        var picked = MissionPool.Assign(steamId, DateOnly.ParseExact(day, "yyyy-MM-dd"));
        Assert.Equal([easy, medium, hard], picked.Select(d => d.Key));
        Assert.Equal([0, 1, 2], picked.Select(d => d.Tier));
        Assert.Equal([50, 100, 150], picked.Select(d => d.Xp));
    }

    [Fact]
    public void Пулът_ключ_е_вид_и_цел_трудността_съвпада_и_няма_повторения()
    {
        var all = MissionPool.Tiers.SelectMany(t => t).ToList();
        Assert.Equal(all.Count, all.Select(d => d.Key).Distinct().Count());
        for (var tier = 0; tier < MissionPool.Tiers.Length; tier++)
        {
            foreach (var d in MissionPool.Tiers[tier])
            {
                Assert.Equal($"{d.Kind.ToString().ToLowerInvariant()}_{d.Target}", d.Key);
                Assert.Equal(tier, d.Tier);
                Assert.Equal(d.KindKey, d.Kind.ToString().ToLowerInvariant());
                Assert.InRange(d.Target, 1, 100);
                Assert.Matches("^[a-z]+_[0-9]{1,3}$", d.Key);
            }
        }
        Assert.Equal(Enum.GetValues<MissionKind>().Length, all.Select(d => d.Kind).Distinct().Count());
        Assert.Equal(300, Progression.MissionXp(0) + Progression.MissionXp(1) + Progression.MissionXp(2));
        Assert.Equal(0, Progression.MissionXp(3));
        Assert.Same(all[0], MissionPool.Find(all[0].Key));
        Assert.Null(MissionPool.Find("nope_1"));
    }

    [Fact]
    public void Денят_е_местната_дата_в_София_и_при_смяна_на_часа()
    {
        var (sofia, error) = MissionPool.ResolveZone("Europe/Sofia");
        Assert.Null(error);
        // 21:59 UTC = 00:59 лятно (UTC+3) → вече следващият ден; 22:00 UTC зимно (UTC+2) = 00:00.
        Assert.Equal(new DateOnly(2026, 7, 2), MissionPool.DayOf(new DateTimeOffset(2026, 7, 1, 21, 59, 0, TimeSpan.Zero), sofia));
        Assert.Equal(new DateOnly(2026, 7, 1), MissionPool.DayOf(new DateTimeOffset(2026, 7, 1, 20, 59, 0, TimeSpan.Zero), sofia));
        Assert.Equal(new DateOnly(2026, 12, 2), MissionPool.DayOf(new DateTimeOffset(2026, 12, 1, 22, 0, 0, TimeSpan.Zero), sofia));
        Assert.Equal(new DateOnly(2026, 12, 1), MissionPool.DayOf(new DateTimeOffset(2026, 12, 1, 21, 59, 0, TimeSpan.Zero), sofia));
        // Нощта на смяната (25.10.2026, 04:00 → 03:00): денят пак е 25-и.
        Assert.Equal(new DateOnly(2026, 10, 25), MissionPool.DayOf(new DateTimeOffset(2026, 10, 25, 1, 30, 0, TimeSpan.Zero), sofia));
        var (fallback, why) = MissionPool.ResolveZone("Mars/Olympus");
        Assert.Equal(sofia.Id, fallback.Id);
        Assert.NotNull(why);
    }

    [Fact]
    public void Броят_само_съвпадащите_убийства_до_целта_и_изпълнението_е_веднъж()
    {
        // 76561198000000001 на 25.10: pistol_10 · minutes_60 · headshots_50.
        var book = new MissionBook(Player, Day, []);
        Assert.Equal(MissionUpdate.None, book.RecordKill(Kill("ak47"), T0));
        var u = book.RecordKill(Kill("weapon_deagle", hs: true), T0);
        Assert.Equal(["pistol_10", "headshots_50"], u.Changed.Select(s => s.Def.Key));
        Assert.Empty(u.Completed);
        for (var i = 0; i < 8; i++) book.RecordKill(Kill("glock"), T0);
        var done = book.RecordKill(Kill("usp_silencer"), T0.AddMinutes(1));
        Assert.Equal("pistol_10", Assert.Single(done.Completed).Def.Key);
        Assert.Equal(T0.AddMinutes(1), book.Slots[0].CompletedAt);
        Assert.Equal(10, book.Slots[0].Progress);
        Assert.Equal(MissionUpdate.None, book.RecordKill(Kill("p250"), T0.AddMinutes(2)));
        Assert.Equal(1, book.DoneCount);
        Assert.False(book.AllDone);
    }

    [Fact]
    public void Серията_е_най_дългата_за_деня_минутите_са_от_секундите()
    {
        // 76561197960265728 на 29.03: smg_10 · zone_3 · streak_10.
        var book = new MissionBook("76561197960265728", new DateOnly(2026, 3, 29), []);
        book.RecordKill(Kill(streak: 7), T0);
        book.RecordKill(Kill(streak: 1), T0);
        Assert.Equal(7, book.Slots[2].Progress);
        Assert.Single(book.RecordKill(Kill(streak: 12), T0).Completed);
        Assert.Equal(10, book.Slots[2].Progress);
        book.RecordKill(Kill(zone: true), T0);
        Assert.Equal(1, book.Slots[1].Progress);

        var minutes = new MissionBook(Player, Day, [new SavedMission("minutes_60", 58, null)]);
        Assert.Equal(MissionUpdate.None, minutes.RecordPlaySeconds(59, T0));
        Assert.Equal(58, minutes.Slots[1].Progress);
        Assert.Equal("minutes_60", Assert.Single(minutes.RecordPlaySeconds(61, T0).Changed).Def.Key);
        Assert.Equal(60, minutes.Slots[1].Progress);
        Assert.True(minutes.Slots[1].Done);
        Assert.Equal(MissionUpdate.None, minutes.RecordPlaySeconds(0, T0));
    }

    [Fact]
    public void Запазеното_се_зарежда_чуждите_ключове_се_пропускат_изпълненото_остава()
    {
        var at = T0.AddHours(-3);
        var book = new MissionBook(Player, Day,
        [
            new SavedMission("pistol_10", 10, at),
            new SavedMission("headshots_50", 99, null),
            new SavedMission("knife_1", 1, at),
        ]);
        Assert.True(book.Slots[0].Done);
        Assert.Equal(at, book.Slots[0].CompletedAt);
        Assert.Equal(50, book.Slots[2].Progress);
        Assert.Equal(1, book.DoneCount);
        // Цел, стигната без запис за изпълнение (стар ред) — следващото събитие я довършва.
        Assert.Single(book.RecordKill(Kill(hs: true), T0).Completed);
    }

    [Fact]
    public void Дуел_нож_стена_дим_noscope_и_Most_Wanted_брояt_по_веднъж()
    {
        var day = DateOnly.ParseExact("2026-10-26", "yyyy-MM-dd");
        // 76561198000000001 на 26.10: headshots_10 · headshots_25 · wanted_1.
        var book = new MissionBook(Player, day, []);
        Assert.Equal(MissionUpdate.None, book.RecordDuelWin(T0));
        var u = book.RecordKill(Kill(hs: true, wanted: true), T0);
        Assert.Equal(3, u.Changed.Count);
        Assert.Equal("wanted_1", Assert.Single(u.Completed).Def.Key);

        var all = MissionPool.Tiers.SelectMany(t => t).ToDictionary(d => d.Key);
        foreach (var (key, hit, miss) in new[]
                 {
                     ("knife_1", Kill("knife", knife: true), Kill("ak47")),
                     ("noscope_1", Kill("awp", noscope: true), Kill("awp")),
                     ("wallbang_1", Kill(wall: true), Kill()),
                     ("smoke_1", Kill(smoke: true), Kill()),
                     ("zone_3", Kill(zone: true), Kill()),
                     ("sniper_10", Kill("ssg08"), Kill("ak47")),
                     ("smg_10", Kill("weapon_mp9"), Kill("nova")),
                     ("rifle_15", Kill("m4a1_silencer"), Kill("deagle")),
                     ("pistol_10", Kill("revolver"), Kill("mac10")),
                     ("headshots_10", Kill(hs: true), Kill()),
                 })
        {
            var one = new MissionBook(Day, [all[key]], []);
            Assert.Equal(MissionUpdate.None, one.RecordKill(miss, T0));
            Assert.Equal(1, Assert.Single(one.RecordKill(hit, T0).Changed).Progress);
            Assert.Equal(all[key].Target == 1, one.AllDone);
        }
        var duelBook = new MissionBook(Day, [all["duel_1"]], []);
        Assert.Equal(MissionUpdate.None, duelBook.RecordKill(Kill(hs: true, knife: true), T0));
        Assert.Single(duelBook.RecordDuelWin(T0).Completed);
        Assert.True(duelBook.AllDone);
        Assert.Equal(MissionUpdate.None, duelBook.RecordDuelWin(T0));
        Assert.Equal("rifle", Progression.WeaponClass("weapon_m4a1_silencer"));
        Assert.Equal("sniper", Progression.WeaponClass("ssg08"));
        Assert.Equal("smg", Progression.WeaponClass("bizon"));
        Assert.Equal("pistol", Progression.WeaponClass("cz75a"));
        Assert.Null(Progression.WeaponClass("nova"));
        Assert.Null(Progression.WeaponClass("knife_t"));
        Assert.Null(Progression.WeaponClass("hegrenade"));
        Assert.True(Progression.IsSniper("weapon_awp"));
        Assert.False(Progression.IsSniper("ak47"));
    }

    [Fact]
    public void Партидата_взема_по_голямото_и_по_ранното_и_сливането_е_безопасно()
    {
        var b = new MissionBatch();
        Assert.True(b.IsEmpty);
        b.Put(new MissionRow(Player, Day, "pistol_10", 10, 4, null));
        b.Put(new MissionRow(Player, Day, "pistol_10", 10, 3, null));
        Assert.Equal(4, b.Rows[(Player, Day, "pistol_10")].Progress);
        b.Put(new MissionRow(Player, Day, "pistol_10", 10, 10, T0.AddMinutes(5)));
        b.Put(new MissionRow(Player, Day, "pistol_10", 10, 10, T0.AddMinutes(9)));
        Assert.Equal(T0.AddMinutes(5), b.Rows[(Player, Day, "pistol_10")].CompletedAt);

        var failed = new MissionBatch();
        failed.Put(new MissionRow(Player, Day, "pistol_10", 10, 9, T0));
        failed.Put(new MissionRow(Player, Day, "minutes_60", 60, 12, null));
        failed.StreakChecks.Add((Player, Day));
        b.Merge(failed);
        Assert.Equal(2, b.Rows.Count);
        Assert.Equal((10, T0), (b.Rows[(Player, Day, "pistol_10")].Progress, b.Rows[(Player, Day, "pistol_10")].CompletedAt));
        Assert.Contains((Player, Day), b.StreakChecks);
        Assert.False(b.IsEmpty);
    }
}
