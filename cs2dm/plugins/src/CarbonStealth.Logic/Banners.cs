namespace CarbonStealth.Logic;

/// <summary>Ред текст на банер: размер на шрифта (px) и цвят.</summary>
public sealed record BannerLine(string Text, int FontSize, byte R, byte G, byte B);

/// <summary>Текстов банер (point_worldtext) — работи веднага, без addon за клиентите.</summary>
public sealed record TextBanner(string Key, IReadOnlyList<BannerLine> Lines);

/// <summary>Позиция и ъгли на банер в света (както се пазят в map_banners).</summary>
public readonly record struct Placement(float X, float Y, float Z, float Pitch, float Yaw, float Roll);

public static class BannerCatalog
{
    /// <summary>Рекламите на Carbon Stealth. Текстът в света е еднакъв за всички → английски.</summary>
    public static readonly IReadOnlyDictionary<string, TextBanner> Text = new Dictionary<string, TextBanner>(StringComparer.Ordinal)
    {
        ["carbonstealth"] = new("carbonstealth",
        [
            new("CARBONSTEALTH.EU", 96, 255, 255, 255),
            new("Websites · E-commerce · Apps · ERP", 44, 190, 190, 190),
        ]),
        ["adblock"] = new("adblock",
        [
            new("ADBLOCK.CARBONSTEALTH.EU", 80, 0, 184, 212),
            new("Free ad & tracker blocker · Chrome · Edge · Brave", 40, 255, 255, 255),
        ]),
    };

    /// <summary>Ключ на банер: a–z, 0–9, „_“, „-“, до 32 знака (колоната е VARCHAR(32)).</summary>
    public static bool IsValidKey(string key) =>
        key.Length is > 0 and <= 32 && key.All(c => c is >= 'a' and <= 'z' or >= '0' and <= '9' or '_' or '-');
}

public static class BannerPlacement
{
    /// <summary>Отстояние от стената (единици), за да не трепти текстурата в стената.</summary>
    public const float WallOffset = 1.5f;

    /// <summary>Светови единици на пиксел шрифт за текстовите банери.</summary>
    public const float UnitsPerPx = 0.25f;

    /// <summary>Разстояние между редовете като дял от височината на реда.</summary>
    public const float LineGap = 0.25f;

    /// <summary>Стена = почти хоризонтална нормала (под и таван се отказват).</summary>
    public static bool IsWall(float nz) => MathF.Abs(nz) < 0.3f;

    /// <summary>
    /// Поставяне по точката на попадение и нормалата на стената. point_worldtext е видим откъм лицето
    /// си при ъгли (0, нормала + 90, 90) — същото като yaw на гледащия + 270 в K4-WorldText. Моделите от
    /// addon-а са плоскости с лице към +X → (0, нормала, 0). null = не е стена.
    /// </summary>
    public static Placement? OnWall(float hx, float hy, float hz, float nx, float ny, float nz, bool model)
    {
        if (!IsWall(nz)) return null;
        var len = MathF.Sqrt(nx * nx + ny * ny);
        if (len < 1e-3f) return null;
        nx /= len;
        ny /= len;
        var normalYaw = MathF.Atan2(ny, nx) * 180f / MathF.PI;
        var x = hx + nx * WallOffset;
        var y = hy + ny * WallOffset;
        return model
            ? new Placement(x, y, hz, 0f, NormalizeYaw(normalYaw), 0f)
            : new Placement(x, y, hz, 0f, NormalizeYaw(normalYaw + 90f), 90f);
    }

    public static float NormalizeYaw(float yaw)
    {
        var y = yaw % 360f;
        return y < 0 ? y + 360f : y;
    }

    /// <summary>
    /// Вертикално отместване (спрямо точката на поставяне) на горния ръб на всеки ред — блокът е
    /// центриран около точката, редовете вървят надолу.
    /// </summary>
    public static float[] LineTops(IReadOnlyList<BannerLine> lines)
    {
        var heights = lines.Select(l => l.FontSize * UnitsPerPx).ToArray();
        var total = heights.Sum() + LineGap * heights.Skip(1).Sum();
        var tops = new float[heights.Length];
        var top = total / 2f;
        for (var i = 0; i < heights.Length; i++)
        {
            if (i > 0) top -= heights[i] * LineGap;
            tops[i] = top;
            top -= heights[i];
        }
        return tops;
    }
}

/// <summary>Ротация на рекламите в чата: един ключ на всеки интервал, по ред.</summary>
public sealed class AdvertRotation(IReadOnlyList<string> keys)
{
    private int _next;

    public string? Next()
    {
        if (keys.Count == 0) return null;
        var key = keys[_next % keys.Count];
        _next = (_next + 1) % keys.Count;
        return key;
    }
}
