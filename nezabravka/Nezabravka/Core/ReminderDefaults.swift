import Foundation

/// Разумните стойности по подразбиране при нова записка.
public enum ReminderDefaults {
    /// Предложеният час: следващият кръгъл час (никога в миналото).
    public static func suggestedDate(now: Date = Date(), calendar: Calendar = .autoupdatingCurrent) -> Date {
        guard let inAnHour = calendar.date(byAdding: .hour, value: 1, to: now) else { return now }
        var components = calendar.dateComponents([.year, .month, .day, .hour], from: inAnHour)
        components.minute = 0
        components.second = 0
        guard let rounded = calendar.date(from: components), rounded > now else { return inAnHour }
        return rounded
    }

    /// Има ли смисъл записката изобщо да се насрочва.
    public static func warning(for date: Date, rule: RepeatRule, now: Date = Date()) -> String? {
        guard rule == .once, date <= now else { return nil }
        return "Този час вече е минал — известие няма да има. Избери бъдещ ден и час."
    }
}
