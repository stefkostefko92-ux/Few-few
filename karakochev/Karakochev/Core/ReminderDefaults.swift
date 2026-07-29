import Foundation

/// Разумните стойности по подразбиране при нова записка.
public enum ReminderDefaults {
    /// Часът, който се подразбира, когато е казан ден без час („утре“).
    public static let fallbackHour = 9

    /// Предложеният час: следващият кръгъл час (никога в миналото).
    public static func suggestedDate(now: Date = Date(), calendar: Calendar = .autoupdatingCurrent) -> Date {
        guard let inAnHour = calendar.date(byAdding: .hour, value: 1, to: now) else { return now }
        var components = calendar.dateComponents([.year, .month, .day, .hour], from: inAnHour)
        components.minute = 0
        components.second = 0
        guard let rounded = calendar.date(from: components), rounded > now else { return inAnHour }
        return rounded
    }

    /// Има ли смисъл записката изобщо да се насрочва. Връща **причината**,
    /// не изречението — текстът се превежда в приложния слой.
    public static func warning(for date: Date, rule: RepeatRule, now: Date = Date()) -> ReminderWarning? {
        guard rule == .once, date <= now else { return nil }
        return .pastOneOff
    }
}

/// Защо записката няма да се обади.
public enum ReminderWarning: String, Sendable {
    /// Еднократна записка с час в миналото.
    case pastOneOff

    public var localizationKey: String { "warning.\(rawValue)" }
}
