using System.Text;
using CarbonStealth.Logic;
using CounterStrikeSharp.API;
using Microsoft.Extensions.Logging;

namespace CarbonStealth;

/// <summary>
/// Плъгините от панела (CONTRACT §14): живото пускане/спиране през <c>css_plugins</c> и конфигът на мода.
/// Постоянното (инсталиране, премахване, спиране между рестартите) е на root — plugins-apply.sh; тук е само
/// живият ефект и configs/plugins/&lt;К&gt;/ (папката е на cs2). Пътят идва от каталога — никога от сайта.
/// </summary>
public sealed partial class CarbonStealthPlugin
{
    /// <summary>addons/counterstrikesharp — нашата папка е plugins/CarbonStealth.</summary>
    private string CssRoot => Path.GetFullPath(Path.Combine(ModuleDirectory, "..", ".."));

    private string PluginDll(string folder) => Path.Combine(CssRoot, "plugins", folder, folder + ".dll");

    private string ConfigDir(string config) => Path.Combine(CssRoot, "configs", "plugins", config);

    private void BridgePlugins(BridgeCommand cmd, BridgeReply reply)
    {
        if (PluginCatalog.Find(cmd.Arg("id")) is not { } plugin)
        {
            reply(false, "unknown plugin", null);
            return;
        }
        try
        {
            switch (cmd.Action)
            {
                case "plugins.load" or "plugins.unload":
                    // Metamod плъгин не се пуска/спира жив — файловете вече са преместени, важи след рестарт.
                    if (plugin.Folder is not { } folder) { reply(false, "restart", null); return; }
                    var load = cmd.Action == "plugins.load";
                    if (load && !File.Exists(PluginDll(folder))) { reply(false, "not installed", null); return; }
                    Server.ExecuteCommand($"css_plugins {(load ? "load" : "unload")} {folder}");
                    reply(true, null, null);
                    return;
                case "plugins.config.get":
                    ConfigGet(plugin, reply);
                    return;
                case "plugins.config.set":
                    ConfigSet(plugin, cmd.Arg("text"), reply);
                    return;
                case "plugins.config.reset":
                    ConfigReset(plugin, reply);
                    return;
                default:
                    reply(false, "unknown action", null);
                    return;
            }
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
            Logger.LogWarning("CarbonStealth: plugin {Id} {Action} — file error ({Type})", plugin.Id, cmd.Action, e.GetType().Name);
            reply(false, "io error", null);
        }
    }

    private void ConfigGet(PanelPlugin plugin, BridgeReply reply)
    {
        if (plugin.Config is not { } config) { reply(false, "no config", null); return; }
        var dir = ConfigDir(config);
        var file = Path.Combine(dir, config + ".json");
        var text = "";
        if (File.Exists(file))
        {
            // UTF-8 е до 4 байта на знак — по-голям файл със сигурност е над тавана.
            if (new FileInfo(file).Length > PluginCatalog.MaxConfigChars * 4L) { reply(false, "too large", null); return; }
            text = File.ReadAllText(file, Encoding.UTF8);
            if (text.Length > PluginCatalog.MaxConfigChars) { reply(false, "too large", null); return; }
        }
        reply(true, null, new
        {
            text,
            edited = File.Exists(Path.Combine(dir, PluginCatalog.PanelMarker)),
            hasDefault = plugin.HasDefault && File.Exists(Path.Combine(dir, config + ".default.json")),
        });
    }

    private void ConfigSet(PanelPlugin plugin, string? text, BridgeReply reply)
    {
        if (plugin.Config is not { } config) { reply(false, "no config", null); return; }
        if (!PluginCatalog.TryValidateConfig(text, out var error)) { reply(false, error, null); return; }
        var dir = ConfigDir(config);
        Directory.CreateDirectory(dir);
        WriteAtomic(Path.Combine(dir, config + ".json"), text!);
        // Маркерът: install-mods.sh вече не презаписва този конфиг (§14).
        File.WriteAllText(Path.Combine(dir, PluginCatalog.PanelMarker), "");
        ReloadIfEnabled(plugin);
        reply(true, null, null);
    }

    private void ConfigReset(PanelPlugin plugin, BridgeReply reply)
    {
        if (plugin.Config is not { } config) { reply(false, "no config", null); return; }
        var dir = ConfigDir(config);
        var fallback = Path.Combine(dir, config + ".default.json");
        if (!plugin.HasDefault || !File.Exists(fallback)) { reply(false, "no default", null); return; }
        WriteAtomic(Path.Combine(dir, config + ".json"), File.ReadAllText(fallback, Encoding.UTF8));
        File.Delete(Path.Combine(dir, PluginCatalog.PanelMarker));
        ReloadIfEnabled(plugin);
        reply(true, null, null);
    }

    /// <summary>Временен файл в същата папка + преместване — плъгинът никога не вижда половин конфиг.</summary>
    private static void WriteAtomic(string file, string text)
    {
        var tmp = Path.Combine(Path.GetDirectoryName(file)!, "." + Path.GetFileName(file) + ".tmp");
        File.WriteAllText(tmp, text, new UTF8Encoding(false));
        File.Move(tmp, file, overwrite: true);
    }

    /// <summary>Конфигът се чете при зареждане → unload + load (командите се изпълняват по ред в следващия кадър).</summary>
    private void ReloadIfEnabled(PanelPlugin plugin)
    {
        if (plugin.Folder is not { } folder || !File.Exists(PluginDll(folder))) return;
        Server.ExecuteCommand($"css_plugins unload {folder}");
        Server.ExecuteCommand($"css_plugins load {folder}");
    }
}
