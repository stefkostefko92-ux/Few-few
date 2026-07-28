import Foundation

/// В кой ден спрямо „сега“ пада една дата.
public enum DayBucket: String, Sendable {
    case yesterday, today, tomorrow, withinWeek, later
}

/// Човешкият текст за датата на едно напомняне („днес в 14:30“).
///
/// Разделянето на ден (чиста календарна аритметика, тествана) и на изписване
/// (локализирано форматиране) е нарочно — тестовете не зависят от версията на
/// езиковите данни на системата.
public struct ReminderDateText: Sendable {
    public var calendar: Calendar
    public var locale: Locale

    public init(calendar: Calendar = .autoupdatingCurrent, locale: Locale = Locale(identifier: "bg_BG")) {
        self.calendar = calendar
        self.locale = locale
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

    /// Напр. „днес в 14:30“, „утре в 09:00“, „вторник в 08:00“, „12 август 2026 в 08:00“.
    public func text(for date: Date, now: Date) -> String {
        let time = formatted(date, template: "j:mm")
        switch bucket(for: date, now: now) {
        case .today: return "днес в \(time)"
        case .tomorrow: return "утре в \(time)"
        case .yesterday: return "вчера в \(time)"
        case .withinWeek: return "\(formatted(date, template: "EEEE")) в \(time)"
        case .later:
            let sameYear = calendar.component(.year, from: date) == calendar.component(.year, from: now)
            let template = sameYear ? "d MMMM" : "d MMMM y"
            return "\(formatted(date, template: template)) в \(time)"
        }
    }

    private func formatted(_ date: Date, template: String) -> String {
        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.locale = locale
        formatter.timeZone = calendar.timeZone
        formatter.setLocalizedDateFormatFromTemplate(template)
        return formatter.string(from: date)
    }
}
