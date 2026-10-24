using CarbonStealth.Logic;
using Xunit;

namespace CarbonStealth.Logic.Tests;

/// <summary>Плъгините от панела (CONTRACT §14): каталогът, конфигът от сайта и отговорът на моста.</summary>
public class PluginCatalogTests
{
    [Fact]
    public void Каталогът_е_шестте_мода_без_ядрото()
    {
        Assert.Equal(["serverlistplayersfix", "quakesounds", "cosmetics", "demorecorder", "cheatertroll", "metablock"],
            PluginCatalog.All.Select(p => p.Id));
        foreach (var core in new[] { "metamod", "counterstrikesharp", "deathmatch", "carbonstealth", "multiaddonmanager", "", null })
        {
            Assert.Null(PluginCatalog.Find(core));
        }
        Assert.Null(PluginCatalog.Find("serverlistplayersfix")!.Folder);
        Assert.False(PluginCatalog.Find("cheatertroll")!.HasDefault);
        // Папките и конфигите са само букви — влизат в css_plugins и в пътища.
        Assert.All(PluginCatalog.All, p => Assert.Matches("^[A-Za-z]*$", (p.Folder ?? "") + (p.Config ?? "")));
    }

    [Theory]
    [InlineData("{}", true)]
    [InlineData("{\"enabled\": true, \"a\": [1, 2]}", true)]
    [InlineData("", false)]
    [InlineData(null, false)]
    [InlineData("[]", false)]
    [InlineData("null", false)]
    [InlineData("\"x\"", false)]
    [InlineData("{\"a\": 1,}", false)]
    [InlineData("{/* c */}", false)]
    [InlineData("{\"a\": ", false)]
    public void Конфигът_от_сайта_е_JSON_обект(string? text, bool ok)
    {
        Assert.Equal(ok, PluginCatalog.TryValidateConfig(text, out var error));
        Assert.Equal(ok ? "" : "invalid json", error);
    }

    [Fact]
    public void Конфигът_има_таван_и_дълбочина()
    {
        var big = "{\"a\":\"" + new string('x', PluginCatalog.MaxConfigChars) + "\"}";
        Assert.False(PluginCatalog.TryValidateConfig(big, out _));
        var deep = new string('[', 40) + new string(']', 40);
        Assert.False(PluginCatalog.TryValidateConfig("{\"a\":" + deep + "}", out _));
    }

    [Fact]
    public void Отговорът_на_моста_е_без_null_полета()
    {
        Assert.Equal("{\"id\":\"a\",\"ok\":true}", BridgeProtocol.Ack("a", true, null));
        Assert.Equal("{\"id\":\"b\",\"ok\":false,\"error\":\"busy\"}", BridgeProtocol.Ack("b", false, "busy"));
        Assert.Equal("{\"id\":\"c\",\"ok\":true,\"data\":{\"text\":\"{}\",\"edited\":false}}",
            BridgeProtocol.Ack("c", true, null, new { text = "{}", edited = false }));
    }

    [Fact]
    public void Мостът_приема_командите_за_плъгините()
    {
        foreach (var a in new[] { "plugins.load", "plugins.unload", "plugins.config.get", "plugins.config.set", "plugins.config.reset" })
        {
            Assert.Contains(a, BridgeProtocol.Actions);
        }
    }
}
