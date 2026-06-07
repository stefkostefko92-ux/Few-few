using System;
using System.Collections.Generic;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json;

namespace KaguraSpin
{
    /// <summary>
    /// Real-time clan chat over WebSocket (§7.2). Uses
    /// <see cref="ClientWebSocket"/> (works on standalone/mobile). For WebGL,
    /// swap the transport for a jslib-backed socket (e.g. the NativeWebSocket
    /// package) behind this same surface — ClientWebSocket isn't available there.
    ///
    /// Callbacks fire on a background thread; marshal to Unity's main thread in
    /// the consumer (e.g. via a queue drained in Update) before touching the UI.
    /// </summary>
    public sealed class ChatConnection
    {
        private readonly ClientWebSocket _ws = new();
        private readonly CancellationTokenSource _cts = new();

        public event Action<List<ChatMessage>> OnHistory;
        public event Action<ChatMessage> OnMessage;
        public event Action<string> OnError;
        public event Action OnClosed;

        public ChatConnection(string wsUrl)
        {
            _ = ConnectAndListen(wsUrl);
        }

        private async Task ConnectAndListen(string wsUrl)
        {
            try
            {
                await _ws.ConnectAsync(new Uri(wsUrl), _cts.Token);
                await ReceiveLoop();
            }
            catch (Exception e)
            {
                OnError?.Invoke(e.Message);
            }
            finally
            {
                OnClosed?.Invoke();
            }
        }

        private async Task ReceiveLoop()
        {
            var buffer = new byte[8192];
            var sb = new StringBuilder();
            while (_ws.State == WebSocketState.Open && !_cts.IsCancellationRequested)
            {
                WebSocketReceiveResult result;
                sb.Clear();
                do
                {
                    result = await _ws.ReceiveAsync(new ArraySegment<byte>(buffer), _cts.Token);
                    if (result.MessageType == WebSocketMessageType.Close)
                    {
                        await _ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "bye", CancellationToken.None);
                        return;
                    }
                    sb.Append(Encoding.UTF8.GetString(buffer, 0, result.Count));
                } while (!result.EndOfMessage);

                Dispatch(sb.ToString());
            }
        }

        private void Dispatch(string json)
        {
            IncomingFrame frame;
            try { frame = JsonConvert.DeserializeObject<IncomingFrame>(json); }
            catch { return; }
            if (frame == null) return;

            if (frame.Type == "history")
                OnHistory?.Invoke(frame.Messages ?? new List<ChatMessage>());
            else if (frame.Type == "chat")
                OnMessage?.Invoke(new ChatMessage { From = frame.From, Name = frame.Name, Text = frame.Text, At = frame.At });
        }

        /// <summary>Send a chat message to the clan room.</summary>
        public async void Send(string text)
        {
            if (_ws.State != WebSocketState.Open) return;
            var payload = JsonConvert.SerializeObject(new { type = "chat", text });
            var bytes = Encoding.UTF8.GetBytes(payload);
            await _ws.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, _cts.Token);
        }

        public void Close()
        {
            _cts.Cancel();
            try { _ = _ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "client closed", CancellationToken.None); }
            catch { /* ignore */ }
        }

        private sealed class IncomingFrame
        {
            [JsonProperty("type")] public string Type;
            [JsonProperty("messages")] public List<ChatMessage> Messages;
            [JsonProperty("from")] public string From;
            [JsonProperty("name")] public string Name;
            [JsonProperty("text")] public string Text;
            [JsonProperty("at")] public long At;
        }
    }
}
