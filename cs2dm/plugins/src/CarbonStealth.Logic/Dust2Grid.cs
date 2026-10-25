namespace CarbonStealth.Logic;

/// <summary>
/// Решетката на heatmap-а на de_dust2 (CONTRACT.md §4) — същите константи като `app/src/heatmap.ts`
/// (тест в приложението чете този файл и ги сравнява). Радарът е 1024 px, клетка 32 px (≈ 141 единици),
/// сектори 8 × 8 с етикети A–H × 1–8 („C4“). Ползва го горещата зона за името на резервната зона.
/// </summary>
public static class Dust2Grid
{
    public const string Map = "de_dust2";
    public const float PosX = -2476f;
    public const float PosY = 3239f;
    public const float Scale = 4.4f;
    public const int Size = 1024;
    public const int CellPx = 32;
    public const int Grid = Size / CellPx;
    public const int Sectors = 8;
    public const string Columns = "ABCDEFGH";

    /// <summary>Единици на играта в една клетка (за SQL-а на клъстера).</summary>
    public const double CellUnits = CellPx * (double)Scale;

    /// <summary>Клетката на световна точка; извън радара → null (като `cellOf` в TS).</summary>
    public static (int Cx, int Cy)? CellOf(float x, float y)
    {
        if (!float.IsFinite(x) || !float.IsFinite(y)) return null;
        var cx = (int)Math.Floor((x - PosX) / Scale / CellPx);
        var cy = (int)Math.Floor((PosY - y) / Scale / CellPx);
        if (cx < 0 || cy < 0 || cx >= Grid || cy >= Grid) return null;
        return (cx, cy);
    }

    /// <summary>Секторът на точката („C4“) или null извън радара.</summary>
    public static string? SectorLabel(float x, float y)
    {
        if (CellOf(x, y) is not { } cell) return null;
        const int per = Grid / Sectors;
        return $"{Columns[cell.Cx / per]}{cell.Cy / per + 1}";
    }
}
