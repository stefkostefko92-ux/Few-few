import Foundation

/// Смята кога се задейства едно напомняне.
///
/// Цялата календарна аритметика минава през `Calendar` (не през „+86400 секунди“),
/// за да са верни лятното/зимното часово време, месеците с различна дължина и
/// високосните години.
public struct OccurrenceCalculator: Sendable {
    public var calendar: Calendar

    public init(calendar: Calendar = .autoupdatingCurrent) {
        self.calendar = calendar
    }

    /// Делниците по номерация на `Calendar` (1 = неделя): понеделник…петък.
    static let weekdayNumbers = [2, 3, 4, 5, 6]

    /// Първото задействане строго след `date` — включително отложеното — или
    /// `nil` ако няма такова (еднократно напомняне, чийто час е минал).
    public func nextOccurrence(of reminder: ReminderSnapshot, after date: Date) -> Date? {
        guard !reminder.isDone else { return nil }
        let candidates = [patternOccurrence(of: reminder, after: date), activeSnooze(of: reminder, after: date)]
        return candidates.compactMap { $0 }.min()
    }

    /// Отлагането, ако още не е минало.
    public func activeSnooze(of reminder: ReminderSnapshot, after date: Date) -> Date? {
        guard !reminder.isDone, let snoozed = reminder.snoozedUntil, snoozed > date else { return nil }
        return snoozed
    }

    /// Задействането по шаблона на повторението — без да гледа отлагането.
    public func patternOccurrence(of reminder: ReminderSnapshot, after date: Date) -> Date? {
        guard !reminder.isDone else { return nil }

        // Повтарящо се напомняне, което още не е започнало → първото задействане
        // е самата начална дата, не най-близкото съвпадение по шаблона.
        if reminder.fireDate > date {
            // Освен ако началото не пасва на шаблона: „всеки делник“ с начало в
            // събота не бива да звънне в събота (единственото правило, при което
            // избраната дата може да противоречи на повторението).
            if reminder.repeatRule == .weekdays,
                !Self.weekdayNumbers.contains(calendar.component(.weekday, from: reminder.fireDate))
            {
                return nextWeekday(after: reminder.fireDate, time: timeComponents(of: reminder.fireDate))
            }
            return reminder.fireDate
        }

        switch reminder.repeatRule {
        case .once:
            return nil  // fireDate вече е минала
        case .daily:
            return next(after: date, matching: timeComponents(of: reminder.fireDate))
        case .weekly:
            var components = timeComponents(of: reminder.fireDate)
            components.weekday = calendar.component(.weekday, from: reminder.fireDate)
            return next(after: date, matching: components)
        case .weekdays:
            return nextWeekday(after: date, time: timeComponents(of: reminder.fireDate))
        case .monthly:
            var components = timeComponents(of: reminder.fireDate)
            components.day = calendar.component(.day, from: reminder.fireDate)
            // strict → 31-во число не „пада“ на 28 февруари, а месецът се прескача.
            return next(after: date, matching: components, policy: .strict)
        case .yearly:
            var components = timeComponents(of: reminder.fireDate)
            components.day = calendar.component(.day, from: reminder.fireDate)
            components.month = calendar.component(.month, from: reminder.fireDate)
            return next(after: date, matching: components, policy: .strict)
        }
    }

    /// Следващите `limit` задействания след `date`, във възходящ ред —
    /// включително отложеното (това вижда потребителят).
    public func occurrences(of reminder: ReminderSnapshot, after date: Date, limit: Int) -> [Date] {
        series(of: reminder, after: date, limit: limit, step: nextOccurrence)
    }

    /// Само задействанията по шаблона — без отложеното.
    ///
    /// Планирането на известията ползва тази поредица: отлагането е отделна
    /// заявка, а не стъпало от шаблона (иначе „изяжда“ едно от местата и две
    /// заявки сочат към един и същ момент).
    public func patternOccurrences(of reminder: ReminderSnapshot, after date: Date, limit: Int) -> [Date] {
        series(of: reminder, after: date, limit: limit, step: patternOccurrence)
    }

    private func series(
        of reminder: ReminderSnapshot,
        after date: Date,
        limit: Int,
        step: (ReminderSnapshot, Date) -> Date?
    ) -> [Date] {
        guard limit > 0 else { return [] }
        var result: [Date] = []
        var cursor = date
        while result.count < limit, let next = step(reminder, cursor) {
            result.append(next)
            guard reminder.repeatRule.isRepeating else { break }
            cursor = next
        }
        return result
    }

    /// Просрочено ли е — има зададен час в миналото и няма следващо задействане.
    public func isOverdue(_ reminder: ReminderSnapshot, now: Date) -> Bool {
        !reminder.isDone && reminder.fireDate <= now && nextOccurrence(of: reminder, after: now) == nil
    }

    // MARK: - Помощни

    func timeComponents(of date: Date) -> DateComponents {
        let parts = calendar.dateComponents([.hour, .minute], from: date)
        return DateComponents(hour: parts.hour, minute: parts.minute)
    }

    private func next(
        after date: Date,
        matching components: DateComponents,
        policy: Calendar.MatchingPolicy = .nextTime
    ) -> Date? {
        calendar.nextDate(
            after: date,
            matching: components,
            matchingPolicy: policy,
            repeatedTimePolicy: .first,
            direction: .forward
        )
    }

    private func nextWeekday(after date: Date, time: DateComponents) -> Date? {
        var cursor = date
        // Най-много 7 стъпки — след една седмица задължително сме попаднали на делник.
        for _ in 0..<7 {
            guard let candidate = next(after: cursor, matching: time) else { return nil }
            let weekday = calendar.component(.weekday, from: candidate)
            if Self.weekdayNumbers.contains(weekday) { return candidate }
            cursor = candidate
        }
        return nil
    }
}
