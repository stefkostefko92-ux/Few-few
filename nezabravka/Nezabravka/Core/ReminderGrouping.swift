import Foundation

/// Раздел в списъка.
public enum ReminderSection: String, CaseIterable, Sendable {
    case overdue, today, tomorrow, upcoming, done

    public var title: String {
        switch self {
        case .overdue: return "Просрочени"
        case .today: return "Днес"
        case .tomorrow: return "Утре"
        case .upcoming: return "Предстоящи"
        case .done: return "Изпълнени"
        }
    }
}

/// Един раздел със записите в него.
public struct ReminderGroup: Identifiable, Sendable {
    public let section: ReminderSection
    public let items: [ReminderSnapshot]
    public var id: String { section.rawValue }
}

/// Подрежда напомнянията в разделите на списъка и търси в тях.
///
/// Логиката стои тук (а не във `View`-то), за да е тествана без Xcode.
public struct ReminderGrouping: Sendable {
    public var calendar: Calendar

    public init(calendar: Calendar = .autoupdatingCurrent) {
        self.calendar = calendar
    }

    public func group(_ reminders: [ReminderSnapshot], now: Date) -> [ReminderGroup] {
        let calculator = OccurrenceCalculator(calendar: calendar)
        var buckets: [ReminderSection: [(sortKey: Date, item: ReminderSnapshot)]] = [:]

        for reminder in reminders {
            let section: ReminderSection
            let sortKey: Date

            if reminder.isDone {
                section = .done
                sortKey = reminder.fireDate
            } else if let next = calculator.nextOccurrence(of: reminder, after: now) {
                sortKey = next
                // „Днес“/„утре“ се мерят спрямо подаденото `now`, не спрямо
                // системното време — иначе разделите зависят от часа на пускане.
                switch ReminderDateText.dayOffset(from: now, to: next, calendar: calendar) {
                case 0: section = .today
                case 1: section = .tomorrow
                default: section = .upcoming
                }
            } else {
                section = .overdue
                sortKey = reminder.fireDate
            }

            buckets[section, default: []].append((sortKey, reminder))
        }

        return ReminderSection.allCases.compactMap { section in
            guard let bucket = buckets[section], !bucket.isEmpty else { return nil }
            // Просрочените и изпълнените са най-полезни най-новите отгоре;
            // предстоящите — най-близките отгоре.
            let descending = (section == .overdue || section == .done)
            let sorted = bucket.sorted { descending ? $0.sortKey > $1.sortKey : $0.sortKey < $1.sortKey }
            return ReminderGroup(section: section, items: sorted.map(\.item))
        }
    }

    /// Търсене по заглавие и бележка — без значение на регистър и диакритика
    /// („Плащане“ намира и „плащане“, „Гьоце“ и „гьоце“).
    public func search(_ reminders: [ReminderSnapshot], query: String) -> [ReminderSnapshot] {
        let needle = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !needle.isEmpty else { return reminders }
        return reminders.filter { reminder in
            let haystack = reminder.title + " " + reminder.note
            return haystack.range(of: needle, options: [.caseInsensitive, .diacriticInsensitive]) != nil
        }
    }
}
