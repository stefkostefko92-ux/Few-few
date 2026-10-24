namespace CarbonStealth.Logic;

/// <summary>Текущото събитие по график (CONTRACT.md §12) — както го чете плъгинът от events.</summary>
public sealed record ActiveEvent(int Id, string Kind, string TitleBg, string TitleEn, DateTimeOffset EndsAt, int XpTenths, int? DmModeId)
{
    /// <summary>Заглавието на езика на играча: bg → български, иначе английски.</summary>
    public string Title(bool bulgarian) => bulgarian ? TitleBg : TitleEn;
}

/// <summary>Какво се е сменило от предната проверка: свършило, започнало или редактирано (същият id).</summary>
public readonly record struct EventTransition(ActiveEvent? Ended, ActiveEvent? Started, ActiveEvent? Changed)
{
    public bool IsEmpty => Ended is null && Started is null && Changed is null;
}

/// <summary>
/// Следи текущото събитие между проверките (на 30 s). Чиста логика — обявите, режимът и множителят
/// са в плъгина; тук е само кое е започнало/свършило и ефективният множител.
/// </summary>
public sealed class EventTracker
{
    public ActiveEvent? Current { get; private set; }

    public EventTransition Update(ActiveEvent? next)
    {
        var previous = Current;
        Current = next;
        if (previous is null) return next is null ? default : new EventTransition(null, next, null);
        if (next is null) return new EventTransition(previous, null, null);
        if (previous.Id != next.Id) return new EventTransition(previous, next, null);
        return previous == next ? default : new EventTransition(null, null, next);
    }

    /// <summary>Текущото, ако още не е свършило (между проверките може да е минал краят).</summary>
    public ActiveEvent? ActiveAt(DateTimeOffset now) => Current is { } e && e.EndsAt > now ? e : null;

    /// <summary>Ефективният множител в десети: по-големият от настройката и събитието (CONTRACT §3).</summary>
    public static int EffectiveXpTenths(int settingTenths, ActiveEvent? active) =>
        Math.Clamp(Math.Max(settingTenths, active?.XpTenths ?? 10), 10, 30);
}
