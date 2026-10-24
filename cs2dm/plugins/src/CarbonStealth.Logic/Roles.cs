namespace CarbonStealth.Logic;

/// <summary>7-те нива — същият ред като enum Role в schema.prisma (CONTRACT.md §1).</summary>
public enum Role
{
    Player = 1,
    Vip = 2,
    Helper = 3,
    Moderator = 4,
    Admin = 5,
    HeadAdmin = 6,
    Owner = 7,
}

public enum AdminAction
{
    Kick,
    Mute,
    Gag,
    Warn,
    Silence,
    BanTemporary,
    BanPermanent,
    Unban,
    Slay,
    Menu,
    /// <summary>Поставяне/махане на банери в картата.</summary>
    Banners,
}

public static class Roles
{
    /// <summary>Модераторът бани до 7 дни; над това — админ.</summary>
    public static readonly TimeSpan ModeratorMaxBan = TimeSpan.FromDays(7);

    public static Role Parse(string? dbValue) => dbValue switch
    {
        "VIP" => Role.Vip,
        "HELPER" => Role.Helper,
        "MODERATOR" => Role.Moderator,
        "ADMIN" => Role.Admin,
        "HEADADMIN" => Role.HeadAdmin,
        "OWNER" => Role.Owner,
        _ => Role.Player,
    };

    public static Role MinimumFor(AdminAction action) => action switch
    {
        AdminAction.Kick or AdminAction.Mute or AdminAction.Gag or AdminAction.Warn or AdminAction.Menu => Role.Helper,
        AdminAction.Silence or AdminAction.BanTemporary => Role.Moderator,
        AdminAction.BanPermanent or AdminAction.Unban or AdminAction.Slay => Role.Admin,
        AdminAction.Banners => Role.HeadAdmin,
        _ => Role.Owner,
    };

    /// <summary>Бан: null = завинаги. Модератор — само временен до 7 дни.</summary>
    public static AdminAction BanAction(TimeSpan? duration) =>
        duration is { } d && d <= ModeratorMaxBan ? AdminAction.BanTemporary : AdminAction.BanPermanent;

    public static bool Can(Role actor, AdminAction action) => actor >= MinimumFor(action);

    /// <summary>Immunity: действие върху цел с ниво ≥ своето е отказано (освен собственика върху себе си не важи).</summary>
    public static bool CanTarget(Role actor, Role target) => actor > target;
}
