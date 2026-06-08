using System.Collections.Generic;
using Newtonsoft.Json;
using Newtonsoft.Json.Converters;

namespace KaguraSpin
{
    // Data transfer objects mirroring the backend's public JSON shapes.
    // Uses Newtonsoft.Json (com.unity.nuget.newtonsoft-json) for nested
    // objects/arrays that Unity's built-in JsonUtility can't handle.

    // The server emits rarity as a lowercase string ("common"/.../"mythic").
    // StringEnumConverter makes the mapping explicit rather than relying on
    // default name matching, so a serializer config change can't silently break it.
    [JsonConverter(typeof(StringEnumConverter))]
    public enum Rarity { common, rare, epic, mythic }

    public sealed class Building
    {
        [JsonProperty("level")] public int Level;
    }

    public sealed class Island
    {
        [JsonProperty("index")] public int Index;
        [JsonProperty("buildings")] public List<Building> Buildings = new();
        [JsonProperty("completed")] public bool Completed;
    }

    public sealed class Companion
    {
        [JsonProperty("id")] public string Id;
        [JsonProperty("rarity")] public Rarity Rarity;
        [JsonProperty("summonedAt")] public long SummonedAt;
    }

    public sealed class PendingRaidView
    {
        [JsonProperty("targetId")] public string TargetId;
        [JsonProperty("picks")] public int Picks;
        [JsonProperty("spots")] public int Spots;
        [JsonProperty("expiresAt")] public long ExpiresAt;
    }

    public sealed class PendingAttackView
    {
        [JsonProperty("expiresAt")] public long ExpiresAt;
    }

    public sealed class PublicPlayer
    {
        [JsonProperty("id")] public string Id;
        [JsonProperty("name")] public string Name;
        [JsonProperty("spins")] public int Spins;
        [JsonProperty("coins")] public long Coins;
        [JsonProperty("spiritTokens")] public int SpiritTokens;
        [JsonProperty("gems")] public int Gems;
        [JsonProperty("shields")] public int Shields;
        [JsonProperty("currentIsland")] public int CurrentIsland;
        [JsonProperty("islands")] public List<Island> Islands = new();
        [JsonProperty("companions")] public List<Companion> Companions = new();
        [JsonProperty("clanId")] public string ClanId;
        [JsonProperty("pendingAttack")] public PendingAttackView PendingAttack;
        [JsonProperty("pendingRaid")] public PendingRaidView PendingRaid;
    }

    public sealed class SpinOutcome
    {
        [JsonProperty("type")] public string Type; // JACKPOT | SHIELDS | ATTACK | RAID | SPIRIT | MIX
        [JsonProperty("reels")] public string[] Reels;
        [JsonProperty("coins")] public long Coins;
        [JsonProperty("shields")] public int Shields;
        [JsonProperty("spiritTokens")] public int SpiritTokens;
        [JsonProperty("action")] public string Action; // ATTACK | RAID | null
    }

    public sealed class SpinResult
    {
        [JsonProperty("outcome")] public SpinOutcome Outcome;
        [JsonProperty("player")] public PublicPlayer Player;
    }

    public sealed class BuildResult
    {
        [JsonProperty("player")] public PublicPlayer Player;
        [JsonProperty("newLevel")] public int NewLevel;
        [JsonProperty("cost")] public long Cost;
        [JsonProperty("unlockedIsland")] public int? UnlockedIsland;
    }

    public sealed class AttackResult
    {
        [JsonProperty("player")] public PublicPlayer Player;
        [JsonProperty("blocked")] public bool Blocked;
        [JsonProperty("reward")] public long Reward;
    }

    public sealed class RaidResult
    {
        [JsonProperty("player")] public PublicPlayer Player;
        [JsonProperty("reward")] public long Reward;
    }

    public sealed class SummonResult
    {
        [JsonProperty("rarity")] public Rarity Rarity;
        [JsonProperty("viaPity")] public bool ViaPity;
        [JsonProperty("companion")] public Companion Companion;
    }

    public sealed class Product
    {
        [JsonProperty("productId")] public string ProductId;
        [JsonProperty("kind")] public string Kind;
        [JsonProperty("priceEUR")] public double PriceEUR;
        [JsonProperty("grants")] public Dictionary<string, long> Grants = new();
        [JsonProperty("oneTime")] public bool OneTime;
    }

    public sealed class Clan
    {
        [JsonProperty("id")] public string Id;
        [JsonProperty("name")] public string Name;
        [JsonProperty("tag")] public string Tag;
        [JsonProperty("leaderId")] public string LeaderId;
        [JsonProperty("memberIds")] public List<string> MemberIds = new();
        [JsonProperty("currentWarId")] public string CurrentWarId;
    }

    public sealed class WarStatus
    {
        [JsonProperty("warId")] public string WarId;
        [JsonProperty("myClanId")] public string MyClanId;
        [JsonProperty("opponentClanId")] public string OpponentClanId;
        [JsonProperty("myScore")] public int MyScore;
        [JsonProperty("opponentScore")] public int OpponentScore;
        [JsonProperty("endsAt")] public long EndsAt;
        [JsonProperty("active")] public bool Active;
    }

    public sealed class LeaderboardEntry
    {
        [JsonProperty("playerId")] public string PlayerId;
        [JsonProperty("name")] public string Name;
        [JsonProperty("score")] public long Score;
        [JsonProperty("rank")] public int Rank;
    }

    public sealed class AuthSession
    {
        [JsonProperty("accessToken")] public string AccessToken;
        [JsonProperty("refreshToken")] public string RefreshToken;
    }

    public sealed class RegisterResult
    {
        [JsonProperty("player")] public PublicPlayer Player;
        [JsonProperty("deviceSecret")] public string DeviceSecret;
        [JsonProperty("accessToken")] public string AccessToken;
        [JsonProperty("refreshToken")] public string RefreshToken;
    }

    /// <summary>A clan chat message (history entry or live broadcast).</summary>
    public sealed class ChatMessage
    {
        [JsonProperty("from")] public string From;
        [JsonProperty("name")] public string Name;
        [JsonProperty("text")] public string Text;
        [JsonProperty("at")] public long At;
    }
}
