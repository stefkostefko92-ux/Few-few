import Foundation

/// „Отложи“ — от известието и от списъка.
public enum SnoozeOption: String, CaseIterable, Sendable {
    case tenMinutes
    case oneHour
    case tonight
    case tomorrowMorning

    /// Ключът за превод — виж `RepeatRule.localizationKey`.
    public var localizationKey: String { "snooze.\(rawValue)" }

    /// Действията в самото известие — iOS показва разумно до 4, но два бутона
    /// са четими и на заключен екран.
    public static var notificationActions: [SnoozeOption] { [.tenMinutes, .oneHour] }

    /// Новият час. `nil` само ако календарът не може да построи датата.
    public func nextDate(from now: Date, calendar: Calendar = .autoupdatingCurrent) -> Date? {
        switch self {
        case .tenMinutes:
            return calendar.date(byAdding: .minute, value: 10, to: now)
        case .oneHour:
            return calendar.date(byAdding: .hour, value: 1, to: now)
        case .tonight:
            let tonight = calendar.date(bySettingHour: 19, minute: 0, second: 0, of: now)
            // Ако 19:00 вече е минало, „довечера“ няма смисъл → утре вечер.
            if let tonight, tonight > now { return tonight }
            guard let tomorrow = calendar.date(byAdding: .day, value: 1, to: now) else { return nil }
            return calendar.date(bySettingHour: 19, minute: 0, second: 0, of: tomorrow)
        case .tomorrowMorning:
            guard let tomorrow = calendar.date(byAdding: .day, value: 1, to: now) else { return nil }
            return calendar.date(bySettingHour: 9, minute: 0, second: 0, of: tomorrow)
        }
    }
}
