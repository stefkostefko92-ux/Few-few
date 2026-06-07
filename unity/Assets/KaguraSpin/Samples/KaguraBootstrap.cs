using System.Threading.Tasks;
using UnityEngine;

namespace KaguraSpin.Samples
{
    /// <summary>
    /// Minimal end-to-end demo: registers (or logs in) a device-bound player,
    /// reads /me, spins once, and — if a Strike/Raid was rolled — follows up the
    /// granted action, exactly like the web demo. Attach to a GameObject and
    /// press Play. The chat snippet shows the WebSocket surface.
    ///
    /// This is a starter skeleton; wire the calls to your own UI.
    /// </summary>
    public sealed class KaguraBootstrap : MonoBehaviour
    {
        [SerializeField] private string apiBaseUrl = "http://localhost:3000";
        [SerializeField] private string playerName = "Kannushi";

        private KaguraClient _client;
        private ChatConnection _chat;

        private const string DeviceIdKey = "kagura.deviceId";
        private const string DeviceSecretKey = "kagura.deviceSecret";

        private async void Start()
        {
            _client = new KaguraClient(apiBaseUrl);
            try
            {
                await AuthenticateAsync();
                var me = await _client.MeAsync();
                Debug.Log($"[KAGURA] {me.Name} — spins:{me.Spins} coins:{me.Coins} island:{me.CurrentIsland + 1}");

                var spin = await _client.SpinAsync(1);
                Debug.Log($"[KAGURA] spin: {spin.Outcome.Type} [{string.Join(",", spin.Outcome.Reels)}] coins:{spin.Outcome.Coins}");
                await ResolveActionAsync(spin.Outcome);

                if (!string.IsNullOrEmpty(me.ClanId)) ConnectChat();
            }
            catch (KaguraError e)
            {
                Debug.LogError($"[KAGURA] {e}");
            }
        }

        private async Task AuthenticateAsync()
        {
            var deviceId = PlayerPrefs.GetString(DeviceIdKey, null);
            var secret = PlayerPrefs.GetString(DeviceSecretKey, null);
            if (!string.IsNullOrEmpty(deviceId) && !string.IsNullOrEmpty(secret))
            {
                await _client.LoginAsync(deviceId, secret);
                return;
            }
            deviceId = KaguraClient.GenerateDeviceId();
            var reg = await _client.RegisterAsync(playerName, deviceId);
            PlayerPrefs.SetString(DeviceIdKey, deviceId);
            PlayerPrefs.SetString(DeviceSecretKey, reg.DeviceSecret);
            PlayerPrefs.Save();
        }

        private async Task ResolveActionAsync(SpinOutcome outcome)
        {
            if (outcome.Action == "ATTACK")
            {
                var candidates = await _client.AttackCandidatesAsync();
                if (candidates.Count > 0)
                {
                    var r = await _client.AttackAsync(candidates[0].Id, 0);
                    Debug.Log(r.Blocked ? "[KAGURA] attack blocked" : $"[KAGURA] stole {r.Reward} coins");
                }
            }
            else if (outcome.Action == "RAID")
            {
                var r = await _client.RaidAsync(new[] { 0, 1, 2 });
                Debug.Log($"[KAGURA] raid dug {r.Reward} coins");
            }
        }

        private void ConnectChat()
        {
            _chat = _client.ConnectChat();
            _chat.OnHistory += msgs => Debug.Log($"[KAGURA] chat history: {msgs.Count} messages");
            _chat.OnMessage += m => Debug.Log($"[KAGURA] {m.Name}: {m.Text}");
            // NOTE: these callbacks fire off the main thread — marshal to the main
            // thread (e.g. a ConcurrentQueue drained in Update) before touching UI.
        }

        private void OnDestroy() => _chat?.Close();
    }
}
