namespace CarbonStealth.Logic;

/// <summary>Факти за едно убийство, нужни за XP (виж CONTRACT.md §3).</summary>
public readonly record struct KillFacts(
    bool Headshot,
    bool Knife,
    bool Noscope,
    bool Wallbang,
    bool ThroughSmoke,
    bool Revenge,
    int BountyClaimed);

/// <summary>XP, нива и майсторство — същите константи като в приложението (TS).</summary>
public static class Progression
{
    public const int KillXp = 10;
    public const int HeadshotXp = 5;
    public const int KnifeXp = 20;
    public const int NoscopeXp = 10;
    public const int WallbangXp = 5;
    public const int ThroughSmokeXp = 5;
    public const int RevengeXp = 5;

    public static int XpForKill(KillFacts k)
    {
        var xp = KillXp;
        if (k.Headshot) xp += HeadshotXp;
        if (k.Knife) xp += KnifeXp;
        if (k.Noscope) xp += NoscopeXp;
        if (k.Wallbang) xp += WallbangXp;
        if (k.ThroughSmoke) xp += ThroughSmokeXp;
        if (k.Revenge) xp += RevengeXp;
        return xp + Math.Max(0, k.BountyClaimed);
    }

    /// <summary>
    /// Множител на XP в десети (10…30): floor(xp · m10 / 10) — цели числа, същото като
    /// applyXpMultiplier в levels.ts (CONTRACT.md §3). 15×1,5 → 22; извън 10…30 се приклещва.
    /// </summary>
    public static int ApplyMultiplier(int xp, int tenths) =>
        (int)(Math.Max(0, xp) * (long)Math.Clamp(tenths, 10, 30) / 10);

    /// <summary>Делителят на XP за убийство на бот (CONTRACT.md §3) — същият като BOT_XP_DIVISOR в levels.ts.</summary>
    public const int BotXpDivisor = 2;

    /// <summary>
    /// Убийство на бот: XP-то след множителя, делено на 2 и закръглено надолу — 15 → 7, 10 → 5.
    /// Без отмъщение и баунти: те са само между хора. Същото като botKillXp в levels.ts.
    /// </summary>
    public static int BotKillXp(int xp) => Math.Max(0, xp) / BotXpDivisor;

    /// <summary>Горещата зона (CONTRACT.md §15) — същото като HOT_ZONE.multiplier в levels.ts.</summary>
    public const int HotZoneMultiplier = 2;

    /// <summary>
    /// Убиец в активната гореща зона: XP-то за убийството (след живия множител, при бот — и след делението)
    /// × 2. Тестови стойности: 15 → 30 · бот 15 → 7 → 14 · извън зоната 15 → 15. Същото като hotZoneXp в TS.
    /// </summary>
    public static int HotZoneXp(int xp, bool inZone) => Math.Max(0, xp) * (inZone ? HotZoneMultiplier : 1);

    /// <summary>Сваленият Most Wanted (CONTRACT.md §15) — същото като MOST_WANTED.xp в levels.ts.</summary>
    public const int MostWantedXp = 25;

    /// <summary>
    /// Бонусът за Most Wanted се добавя към XP-то за убийството ПРЕДИ множителя (като баунтито), после идва
    /// горещата зона: 15 + 25 = 40 → ×1,5 → 60 → в зоната 120. Същото като mostWantedBonus в TS.
    /// </summary>
    public static int MostWantedBonus(bool victimWanted) => victimWanted ? MostWantedXp : 0;

    /// <summary>
    /// Спечелен дуел (CONTRACT.md §15): +50 XP наведнъж в края, без множител — не е убийство. Същото като
    /// DUEL.winXp в levels.ts. Равенство и отменен дуел — нищо.
    /// </summary>
    public const int DuelWinXp = 50;

    /// <summary>
    /// Мисиите за деня (CONTRACT.md §16): изпълнена мисия носи XP по трудността ѝ — наведнъж, без множител и
    /// зона (не е убийство). Същото като MISSIONS.xp в levels.ts. Трите за деня дават общо 300 XP.
    /// </summary>
    public const int MissionEasyXp = 50;
    public const int MissionMediumXp = 100;
    public const int MissionHardXp = 150;

    /// <summary>Трудност 0/1/2 → 50/100/150 XP; непозната → 0. Същото като missionXp в TS.</summary>
    public static int MissionXp(int tier) => tier switch
    {
        0 => MissionEasyXp,
        1 => MissionMediumXp,
        2 => MissionHardXp,
        _ => 0,
    };

    /// <summary>Ниво n иска общо 100·n·(n−1)/2 XP → level = floor((1 + √(1 + 8·xp/100)) / 2).</summary>
    public static int LevelFromXp(long xp)
    {
        if (xp <= 0) return 1;
        var level = (int)Math.Floor((1 + Math.Sqrt(1 + 8.0 * xp / 100)) / 2);
        // Защита срещу грешка на плаващата запетая точно на границата.
        while (XpForLevel(level + 1) <= xp) level++;
        while (level > 1 && XpForLevel(level) > xp) level--;
        return level;
    }

    public static long XpForLevel(int level) => level <= 1 ? 0 : 100L * level * (level - 1) / 2;

    public static readonly (string Name, int Kills)[] MasteryTiers =
    [
        ("Bronze", 100),
        ("Silver", 500),
        ("Gold", 1500),
        ("Platinum", 4000),
        ("Diamond", 10000),
    ];

    /// <summary>Най-високата достигната значка за оръжие или null.</summary>
    public static string? MasteryTier(int weaponKills)
    {
        string? tier = null;
        foreach (var (name, kills) in MasteryTiers)
        {
            if (weaponKills >= kills) tier = name;
        }
        return tier;
    }

    /// <summary>„weapon_ak47“ → „ak47“; ножовете (knife, knife_t, bayonet…) → „knife“.</summary>
    public static string NormalizeWeapon(string weapon)
    {
        var w = weapon.StartsWith("weapon_", StringComparison.Ordinal) ? weapon["weapon_".Length..] : weapon;
        return IsKnife(w) ? "knife" : w;
    }

    public static bool IsKnife(string weapon)
    {
        var w = weapon.StartsWith("weapon_", StringComparison.Ordinal) ? weapon["weapon_".Length..] : weapon;
        return w.StartsWith("knife", StringComparison.Ordinal) || w == "bayonet";
    }

    private static readonly HashSet<string> NotGuns = new(StringComparer.Ordinal)
    {
        "hegrenade", "flashbang", "smokegrenade", "molotov", "incgrenade", "decoy", "inferno", "taser",
        "healthshot", "c4", "world", "",
    };

    /// <summary>Огнестрелно оръжие (за точност: изстрели/попадения) — без нож, гранати, taser.</summary>
    public static bool IsGun(string weapon)
    {
        if (IsKnife(weapon)) return false;
        return !NotGuns.Contains(NormalizeWeapon(weapon));
    }

    public static bool IsSniper(string weapon) => WeaponClass(weapon) == "sniper";

    private static readonly Dictionary<string, string> WeaponClasses = new(StringComparer.Ordinal)
    {
        ["ak47"] = "rifle", ["m4a1"] = "rifle", ["m4a1_silencer"] = "rifle", ["m4a1_silencer_off"] = "rifle",
        ["famas"] = "rifle", ["galilar"] = "rifle", ["aug"] = "rifle", ["sg556"] = "rifle",
        ["mac10"] = "smg", ["mp9"] = "smg", ["mp7"] = "smg", ["mp5sd"] = "smg", ["ump45"] = "smg", ["p90"] = "smg",
        ["bizon"] = "smg",
        ["glock"] = "pistol", ["hkp2000"] = "pistol", ["usp_silencer"] = "pistol", ["usp_silencer_off"] = "pistol",
        ["p250"] = "pistol", ["elite"] = "pistol", ["fiveseven"] = "pistol", ["tec9"] = "pistol", ["cz75a"] = "pistol",
        ["deagle"] = "pistol", ["revolver"] = "pistol",
        ["awp"] = "sniper", ["ssg08"] = "sniper", ["scar20"] = "sniper", ["g3sg1"] = "sniper",
    };

    /// <summary>
    /// Класът на оръжието за мисиите (§16): „rifle“, „smg“, „pistol“, „sniper“ или null (нож, пушка, картечница,
    /// граната…). Името е като в събитието на играта, с или без „weapon_“.
    /// </summary>
    public static string? WeaponClass(string weapon) => WeaponClasses.GetValueOrDefault(NormalizeWeapon(weapon));
}
