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

    public static bool IsSniper(string weapon) => NormalizeWeapon(weapon) is "awp" or "ssg08" or "scar20" or "g3sg1";
}
