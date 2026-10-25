using System.Text.Json;

namespace CarbonStealth.Logic;

/// <summary>
/// Мод от каталога на панела (CONTRACT §14). <c>Folder</c> — папката под plugins/ (само CSS; Metamod → null,
/// той се спира с рестарт); <c>Config</c> — configs/plugins/&lt;К&gt;/&lt;К&gt;.json; <c>HasDefault</c> — нашият
/// конфиг идва и като &lt;К&gt;.default.json (CheaterTroll — не: в своя JSON пази списъка с читъри).
/// </summary>
public sealed record PanelPlugin(string Id, string? Folder, string? Config, bool HasDefault);

/// <summary>Същите id като mods-lib.sh, агента и панела (test/plugins-catalog.test.mjs пази паритета).</summary>
public static class PluginCatalog
{
    public const int MaxConfigChars = 32_768;
    /// <summary>Файл в папката на конфига: „редактиран от панела“ → install-mods.sh не го презаписва.</summary>
    public const string PanelMarker = ".cs2dm-panel";

    public static readonly IReadOnlyList<PanelPlugin> All =
    [
        new("serverlistplayersfix", null, null, false),
        new("quakesounds", "QuakeSounds", "QuakeSounds", true),
        new("cosmetics", "Cosmetics", "Cosmetics", true),
        new("demorecorder", "DemoRecorder", "DemoRecorder", true),
        new("cheatertroll", "CheaterTroll", "CheaterTroll", false),
        new("metablock", "MetaBlock", "MetaBlock", true),
    ];

    public static PanelPlugin? Find(string? id) => All.FirstOrDefault(p => p.Id == id);

    /// <summary>Конфиг от панела: непразен, ≤ 32 768 знака, валиден JSON с обект в корена (без коментари).</summary>
    public static bool TryValidateConfig(string? text, out string error)
    {
        error = "invalid json";
        if (string.IsNullOrEmpty(text) || text.Length > MaxConfigChars) return false;
        try
        {
            using var doc = JsonDocument.Parse(text, new JsonDocumentOptions { MaxDepth = 32 });
            if (doc.RootElement.ValueKind != JsonValueKind.Object) return false;
        }
        catch (JsonException)
        {
            return false;
        }
        error = "";
        return true;
    }
}
