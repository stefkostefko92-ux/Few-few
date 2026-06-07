using System;
using System.Collections.Generic;
using System.Text;
using System.Threading.Tasks;
using Newtonsoft.Json;
using UnityEngine.Networking;

namespace KaguraSpin
{
    /// <summary>
    /// Unity client for the KAGURA backend — the C# mirror of the TypeScript
    /// <c>KaguraClient</c> SDK. Async over <see cref="UnityWebRequest"/> so it
    /// works across standalone, mobile, and WebGL. JSON via Newtonsoft.
    /// </summary>
    public sealed class KaguraClient
    {
        private readonly string _baseUrl;
        public AuthSession Session { get; private set; }

        public KaguraClient(string baseUrl, AuthSession session = null)
        {
            _baseUrl = baseUrl.TrimEnd('/');
            Session = session;
        }

        /// <summary>Stable per-install device id — persist it (e.g. PlayerPrefs).</summary>
        public static string GenerateDeviceId() => "kagura-" + Guid.NewGuid().ToString("N");

        // ---- Auth (§11.2) --------------------------------------------------

        public async Task<RegisterResult> RegisterAsync(string name, string deviceId)
        {
            var res = await RequestAsync<RegisterResult>("POST", "/auth/register",
                new { name, deviceId }, auth: false);
            Session = new AuthSession { AccessToken = res.AccessToken, RefreshToken = res.RefreshToken };
            return res;
        }

        public async Task<string> LoginAsync(string deviceId, string deviceSecret)
        {
            var res = await RequestAsync<LoginResponse>("POST", "/auth/login",
                new { deviceId, deviceSecret }, auth: false);
            Session = new AuthSession { AccessToken = res.AccessToken, RefreshToken = res.RefreshToken };
            return res.PlayerId;
        }

        public async Task RefreshAsync()
        {
            if (Session == null) throw new KaguraError("NO_SESSION", "no session to refresh", 401);
            var res = await RequestAsync<AuthSession>("POST", "/auth/refresh",
                new { refreshToken = Session.RefreshToken }, auth: false);
            Session = res;
        }

        public async Task LogoutAsync()
        {
            await RequestAsync<object>("POST", "/auth/logout");
            Session = null;
        }

        // ---- Game (§5) -----------------------------------------------------

        public async Task<PublicPlayer> MeAsync() => (await RequestAsync<MeResponse>("GET", "/me")).Player;

        public Task<SpinResult> SpinAsync(int betMultiplier = 1) =>
            RequestAsync<SpinResult>("POST", "/spin", new { betMultiplier });

        public Task<BuildResult> BuildAsync(int buildingIndex) =>
            RequestAsync<BuildResult>("POST", "/build", new { buildingIndex });

        public async Task<List<Candidate>> AttackCandidatesAsync() =>
            (await RequestAsync<CandidatesResponse>("GET", "/attack/candidates")).Candidates;

        public Task<AttackResult> AttackAsync(string targetId, int buildingIndex) =>
            RequestAsync<AttackResult>("POST", "/attack", new { targetId, buildingIndex });

        public Task<RaidResult> RaidAsync(int[] picks) =>
            RequestAsync<RaidResult>("POST", "/raid", new { picks });

        public Task<SummonResult> SummonAsync() => RequestAsync<SummonResult>("POST", "/gacha/pull");

        // ---- Monetization (§8) --------------------------------------------

        public async Task<List<Product>> ShopAsync() =>
            (await RequestAsync<ShopResponse>("GET", "/shop", auth: false)).Products;

        public Task<RedeemResponse> RedeemAsync(string platform, string productId, string receipt) =>
            RequestAsync<RedeemResponse>("POST", "/iap/redeem", new { platform, productId, receipt });

        // ---- Clans (§7.2) --------------------------------------------------

        public async Task<List<Clan>> ListClansAsync() =>
            (await RequestAsync<ClansResponse>("GET", "/clans", auth: false)).Clans;

        public async Task<Clan> CreateClanAsync(string name, string tag) =>
            (await RequestAsync<ClanResponse>("POST", "/clans", new { name, tag })).Clan;

        public async Task<Clan> JoinClanAsync(string clanId) =>
            (await RequestAsync<ClanResponse>("POST", $"/clans/{Uri.EscapeDataString(clanId)}/join")).Clan;

        public Task LeaveClanAsync() => RequestAsync<object>("POST", "/clans/leave");

        public async Task<WarStatus> DeclareWarAsync() =>
            (await RequestAsync<WarResponse>("POST", "/clans/war/declare")).War;

        public async Task<WarStatus> WarStatusAsync() =>
            (await RequestAsync<WarResponse>("GET", "/clans/war")).War;

        // ---- Leaderboard (§7.2) -------------------------------------------

        public async Task<List<LeaderboardEntry>> LeaderboardAsync(int top = 10) =>
            (await RequestAsync<LeaderboardResponse>("GET", $"/leaderboard?top={top}", auth: false)).Leaderboard;

        // ---- Real-time clan chat (§7.2) -----------------------------------

        /// <summary>Open the clan-chat WebSocket. Requires an active session.</summary>
        public ChatConnection ConnectChat()
        {
            if (Session == null) throw new KaguraError("NO_SESSION", "log in before connecting chat", 401);
            var wsUrl = (_baseUrl.StartsWith("https") ? "wss" : "ws") +
                        _baseUrl.Substring(_baseUrl.IndexOf("://", StringComparison.Ordinal)) +
                        "/ws?token=" + Uri.EscapeDataString(Session.AccessToken);
            return new ChatConnection(wsUrl);
        }

        // ---- Transport -----------------------------------------------------

        private async Task<T> RequestAsync<T>(string method, string path, object body = null, bool auth = true)
        {
            using var req = new UnityWebRequest(_baseUrl + path, method)
            {
                downloadHandler = new DownloadHandlerBuffer()
            };
            if (body != null)
            {
                var json = JsonConvert.SerializeObject(body);
                req.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(json));
                req.SetRequestHeader("Content-Type", "application/json");
            }
            if (auth)
            {
                if (Session == null) throw new KaguraError("NO_SESSION", "not authenticated", 401);
                req.SetRequestHeader("Authorization", "Bearer " + Session.AccessToken);
            }

            await req.SendAsync();

            var text = req.downloadHandler != null ? req.downloadHandler.text : null;
            var status = req.responseCode;
            if (status < 200 || status >= 300)
            {
                ErrorEnvelope env = null;
                try { env = JsonConvert.DeserializeObject<ErrorEnvelope>(text); } catch { /* non-JSON */ }
                throw new KaguraError(env?.Error?.Code ?? "ERROR",
                    env?.Error?.Message ?? req.error ?? "request failed", status);
            }
            return string.IsNullOrEmpty(text) ? default : JsonConvert.DeserializeObject<T>(text);
        }

        // ---- Response envelopes -------------------------------------------

        private sealed class MeResponse { [JsonProperty("player")] public PublicPlayer Player; }
        private sealed class ShopResponse { [JsonProperty("products")] public List<Product> Products; }
        private sealed class ClansResponse { [JsonProperty("clans")] public List<Clan> Clans; }
        private sealed class ClanResponse { [JsonProperty("clan")] public Clan Clan; }
        private sealed class WarResponse { [JsonProperty("war")] public WarStatus War; }
        private sealed class LeaderboardResponse { [JsonProperty("leaderboard")] public List<LeaderboardEntry> Leaderboard; }
        private sealed class CandidatesResponse { [JsonProperty("candidates")] public List<Candidate> Candidates; }
        private sealed class LoginResponse
        {
            [JsonProperty("playerId")] public string PlayerId;
            [JsonProperty("accessToken")] public string AccessToken;
            [JsonProperty("refreshToken")] public string RefreshToken;
        }
        private sealed class ErrorEnvelope { [JsonProperty("error")] public ErrorBody Error; }
        private sealed class ErrorBody
        {
            [JsonProperty("code")] public string Code;
            [JsonProperty("message")] public string Message;
        }
    }

    public sealed class Candidate
    {
        [JsonProperty("id")] public string Id;
        [JsonProperty("name")] public string Name;
        [JsonProperty("island")] public int Island;
    }

    public sealed class RedeemResponse
    {
        [JsonProperty("granted")] public bool Granted;
        [JsonProperty("player")] public PublicPlayer Player;
    }

    /// <summary>Makes <see cref="UnityWebRequest"/> awaitable with async/await.</summary>
    internal static class UnityWebRequestExtensions
    {
        public static Task<UnityWebRequest> SendAsync(this UnityWebRequest req)
        {
            var tcs = new TaskCompletionSource<UnityWebRequest>();
            var op = req.SendWebRequest();
            op.completed += _ => tcs.TrySetResult(req);
            return tcs.Task;
        }
    }
}
