using System.Text;
using System.Text.Json;
using CarbonStealth.Logic;
using CounterStrikeSharp.API;
using Microsoft.Extensions.Logging;
using StackExchange.Redis;

namespace CarbonStealth;

/// <summary>
/// Мостът към сайта (CONTRACT.md §5): подписани команди от cs2dm:cmd, отговори в cs2dm:ack,
/// живо състояние в cs2dm:live, събития в потока cs2dm:events. Redis се свързва сам наново.
/// </summary>
public sealed class BridgeClient : IAsyncDisposable
{
    private static readonly RedisChannel CmdChannel = RedisChannel.Literal("cs2dm:cmd");
    private static readonly RedisChannel AckChannel = RedisChannel.Literal("cs2dm:ack");
    private const string LiveKey = "cs2dm:live";
    private const string EventsKey = "cs2dm:events";

    private readonly ConnectionMultiplexer _mux;
    private readonly byte[] _key;
    private readonly ILogger _logger;
    private readonly ReplayGuard _guard = new();

    private BridgeClient(ConnectionMultiplexer mux, byte[] key, ILogger logger)
    {
        _mux = mux;
        _key = key;
        _logger = logger;
    }

    /// <param name="onCommand">Вика се в игровата нишка; вторият аргумент връща резултата.</param>
    public static async Task<BridgeClient> ConnectAsync(string connection, string bridgeKey, ILogger logger,
        Action<BridgeCommand, Action<bool, string?>> onCommand)
    {
        var mux = await ConnectionMultiplexer.ConnectAsync(connection);
        var client = new BridgeClient(mux, Encoding.UTF8.GetBytes(bridgeKey), logger);
        await mux.GetSubscriber().SubscribeAsync(CmdChannel, (_, message) => client.Receive(message, onCommand));
        return client;
    }

    private void Receive(RedisValue message, Action<BridgeCommand, Action<bool, string?>> onCommand)
    {
        if (!BridgeProtocol.TryOpen(message.ToString(), _key, DateTimeOffset.UtcNow, _guard, out var cmd, out var error))
        {
            _logger.LogWarning("CarbonStealth bridge: rejected command ({Error})", error);
            return;
        }
        Server.NextFrame(() =>
        {
            try
            {
                onCommand(cmd!, (ok, err) => Ack(cmd!.Id, ok, err));
            }
            catch (Exception e)
            {
                _logger.LogError(e, "CarbonStealth bridge: command {Action} failed", cmd!.Action);
                Ack(cmd.Id, false, "internal error");
            }
        });
    }

    private void Ack(string id, bool ok, string? error) =>
        Fire(_mux.GetSubscriber().PublishAsync(AckChannel, JsonSerializer.Serialize(new { id, ok, error })), "ack");

    public void PublishLive(string json) =>
        Fire(_mux.GetDatabase().StringSetAsync(LiveKey, json, TimeSpan.FromSeconds(15)), "live");

    public void Event(string type, object data) =>
        Fire(_mux.GetDatabase().StreamAddAsync(EventsKey,
            [new NameValueEntry("type", type), new NameValueEntry("data", JsonSerializer.Serialize(data))],
            maxLength: 2000, useApproximateMaxLength: true), "event");

    /// <summary>Redis е по избор за играта: грешка се логва, никога не спира сървъра.</summary>
    private void Fire(Task task, string what) =>
        task.ContinueWith(t => _logger.LogDebug(t.Exception, "CarbonStealth bridge: {What} failed", what),
            TaskContinuationOptions.OnlyOnFaulted);

    public async ValueTask DisposeAsync()
    {
        await _mux.CloseAsync();
        _mux.Dispose();
    }
}
