import Foundation

/// В кой ден спрямо „сега“ пада една дата.
public enum DayBucket: String, Sendable {
    case yesterday, today, tomorrow, withinWeek, later

    /// Ключът за превод на шаблона („днес в %@“) — текстът е в приложния слой.
    public var localizationKey: String { "date.\(rawValue)" }
}

/// Слага дата в ден-кофа спрямо подаденото „сега“.
///
/// Тук няма език и няма форматиране — само календарна аритметика, за да е
/// тествана без Xcode. Изписването („днес в 14:30“) прави `ReminderDateLabel`
/// в приложния слой, с локала на телефона.
public struct ReminderDayClassifier: Sendable {
    public var calendar: Calendar

    public init(calendar: Calendar = .autoupdatingCurrent) {
        self.calendar = calendar
    }

    public func bucket(for date: Date, now: Date) -> DayBucket {
        switch Self.dayOffset(from: now, to: date, calendar: calendar) {
        case 0: return .today
        case 1: return .tomorrow
        case -1: return .yesterday
        case 2...6: return .withinWeek
        default: return .later
        }
    }

    /// Разлика в цели дни между два момента (в календара на потребителя).
    ///
    /// Нарочно **не** ползваме `Calendar.isDateInToday(_:)` и роднините ѝ — те
    /// сравняват с истинското „сега“ на устройството, а тук „сега“ се подава
    /// отвън (иначе логиката не е тестваема и „днес“ зависи от часа на пускане).
    public static func dayOffset(from start: Date, to end: Date, calendar: Calendar) -> Int {
        calendar.dateComponents(
            [.day],
            from: calendar.startOfDay(for: start),
            to: calendar.startOfDay(for: end)
        ).day ?? 0
    }

    /// Същата ли година е — решава дали изписването носи годината.
    public func isSameYear(_ date: Date, as other: Date) -> Bool {
        calendar.component(.year, from: date) == calendar.component(.year, from: other)
    }
}
