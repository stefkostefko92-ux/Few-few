using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace CarbonStealth.Logic;

/// <summary>Команда от приложението към плъгина (CONTRACT.md §5).</summary>
public sealed record BridgeCommand(string Id, long Ts, string Actor, string Action, JsonElement Args)
{
    public string? Arg(string name) =>
        Args.ValueKind == JsonValueKind.Object && Args.TryGetProperty(name, out var v)
            ? v.ValueKind switch
            {
                JsonValueKind.String => v.GetString(),
                JsonValueKind.Number => v.GetRawText(),
                _ => null,
            }
            : null;
}

/// <summary>
/// Подписан плик: <c>{"p":"&lt;json&gt;","sig":"&lt;hex&gt;"}</c>, където sig = HMAC-SHA256(ключ, байтовете на p).
/// Подписва се самият низ p — без канонизация, затова C# и Node не могат да се разминат.
/// </summary>
public static class BridgeProtocol
{
    public static readonly TimeSpan MaxSkew = TimeSpan.FromSeconds(30);

    public static readonly IReadOnlySet<string> Actions = new HashSet<string>(StringComparer.Ordinal)
    {
        "kick", "punish", "revoke", "say", "slay", "reload", "mode", "settings.reload", "player.reload",
    };

    public static string Sign(string payload, byte[] key) =>
        Convert.ToHexStringLower(HMACSHA256.HashData(key, Encoding.UTF8.GetBytes(payload)));

    public static string Envelope(string payload, byte[] key) =>
        JsonSerializer.Serialize(new Dictionary<string, string> { ["p"] = payload, ["sig"] = Sign(payload, key) });

    public static bool TryOpen(string message, byte[] key, DateTimeOffset now, ReplayGuard guard,
        out BridgeCommand? command, out string error)
    {
        command = null;
        string payload;
        byte[] sig;
        try
        {
            using var env = JsonDocument.Parse(message);
            payload = env.RootElement.GetProperty("p").GetString() ?? "";
            sig = Convert.FromHexString(env.RootElement.GetProperty("sig").GetString() ?? "");
        }
        catch (Exception e) when (e is JsonException or KeyNotFoundException or FormatException or InvalidOperationException)
        {
            error = "malformed envelope";
            return false;
        }

        var expected = HMACSHA256.HashData(key, Encoding.UTF8.GetBytes(payload));
        if (!CryptographicOperations.FixedTimeEquals(expected, sig))
        {
            error = "bad signature";
            return false;
        }

        try
        {
            using var doc = JsonDocument.Parse(payload);
            var r = doc.RootElement;
            var id = r.GetProperty("id").GetString() ?? "";
            var ts = r.GetProperty("ts").GetInt64();
            var actor = r.GetProperty("actor").GetString() ?? "";
            var action = r.GetProperty("action").GetString() ?? "";
            var args = r.TryGetProperty("args", out var a) ? a.Clone() : default;
            if (id.Length is 0 or > 64 || !Actions.Contains(action))
            {
                error = "bad command";
                return false;
            }
            if (Math.Abs(now.ToUnixTimeMilliseconds() - ts) > MaxSkew.TotalMilliseconds)
            {
                error = "stale";
                return false;
            }
            if (!guard.TryAccept(id))
            {
                error = "replay";
                return false;
            }
            command = new BridgeCommand(id, ts, actor, action, args);
            error = "";
            return true;
        }
        catch (Exception e) when (e is JsonException or KeyNotFoundException or FormatException or InvalidOperationException)
        {
            error = "malformed payload";
            return false;
        }
    }
}

/// <summary>Помни последните N id, за да отхвърли повторно изпратена команда.</summary>
public sealed class ReplayGuard(int capacity = 1000)
{
    private readonly HashSet<string> _seen = new(StringComparer.Ordinal);
    private readonly Queue<string> _order = new();
    private readonly Lock _lock = new();

    public bool TryAccept(string id)
    {
        lock (_lock)
        {
            if (!_seen.Add(id)) return false;
            _order.Enqueue(id);
            while (_order.Count > capacity) _seen.Remove(_order.Dequeue());
            return true;
        }
    }
}

public static class Text
{
    /// <summary>Ник за чат/таг: без цветови кодове и тагове, най-много 32 знака.</summary>
    public static string SafeName(string? name)
    {
        if (string.IsNullOrWhiteSpace(name)) return "player";
        var sb = new StringBuilder(name.Length);
        foreach (var ch in name)
        {
            // Контролните знаци са цветови кодове; „{…}“ е цветов таг за локализатора на CSS.
            if (char.IsControl(ch)) continue;
            sb.Append(ch switch { '{' => '(', '}' => ')', _ => ch });
        }
        var clean = sb.ToString().Trim();
        if (clean.Length == 0) return "player";
        return clean.Length > 32 ? clean[..32] : clean;
    }

    /// <summary>Свободен текст от играч (чат, причина): без цветови кодове/тагове, до <paramref name="max"/> знака.</summary>
    public static string SafeText(string? text, int max = 192)
    {
        if (string.IsNullOrEmpty(text)) return "";
        var sb = new StringBuilder(Math.Min(text.Length, max));
        foreach (var ch in text)
        {
            if (char.IsControl(ch)) continue;
            sb.Append(ch switch { '{' => '(', '}' => ')', _ => ch });
            if (sb.Length >= max) break;
        }
        return sb.ToString().Trim();
    }

    public static bool IsSteamId64(string s) =>
        s.Length == 17 && s.StartsWith("7656119", StringComparison.Ordinal) && s.All(char.IsAsciiDigit);
}
