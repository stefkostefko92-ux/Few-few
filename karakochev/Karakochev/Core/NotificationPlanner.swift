import Foundation

/// Едно насрочено известие — това, което после става `UNNotificationRequest`.
public struct PlannedNotification: Hashable, Sendable {
    /// Идентификатор на заявката в iOS. Съдържа id-то на напомнянето, за да може
    /// известието да се върже обратно към записа при натискане.
    public let requestID: String
    public let reminderID: UUID
    public let title: String
    public let body: String
    /// Кога се задейства следващия път — само за подредба и преглед в UI.
    public let nextFireDate: Date
    /// Компонентите, с които се строи `UNCalendarNotificationTrigger`.
    public let dateComponents: DateComponents
    /// `true` → тригерът се повтаря сам, без приложението да се отваря.
    public let repeats: Bool
    public let isImportant: Bool
}

/// Планира кои известия да стоят насрочени в iOS.
///
/// Два ограничителя диктуват дизайна:
/// 1. **iOS пази най-много 64 чакащи локални известия на приложение** — всичко
///    над това се изхвърля мълчаливо. Затова планът се реже до `limit` (по-нисък
///    от 64, за да остане резерв за отлагания) с приоритет на най-близките по време.
/// 2. **Приложението не може да разчита да бъде отваряно.** Затова повтарящите се
///    напомняния получават *повтарящ се* тригер (една заявка, безкрайно задействане),
///    а не списък от предварително изчислени дати.
///
/// Изключение: повтарящо се напомняне с начало в бъдещето не може да се изрази с
/// повтарящ се тригер (той би се задействал преди началото), затова първите
/// `leadOccurrences` задействания се насрочват поединично; при следващото отваряне
/// на приложението планът се пресинхронизира и минава на повтарящ се тригер.
public struct NotificationPlanner: Sendable {
    /// Твърдият лимит на iOS.
    public static let iOSPendingLimit = 64

    public var calendar: Calendar
    /// Колко заявки най-много да заемаме (резерв под лимита на iOS).
    public var limit: Int
    /// Колко задействания се насрочват поединично за още незапочнало повторение.
    public var leadOccurrences: Int
    /// Колко задействания напред покрива поредицата за правило без нативен тригер.
    public var seriesOccurrences: Int
    /// След колко време важното напомняне пита пак, ако не е потвърдено.
    public var nudgeOffsets: [TimeInterval]
    /// Какво пише в известието, ако записката е без заглавие. Подава се отвън,
    /// защото е преведен низ, а ядрото няма език.
    public var fallbackTitle: String

    public init(
        calendar: Calendar = .autoupdatingCurrent,
        limit: Int = 56,
        leadOccurrences: Int = 4,
        seriesOccurrences: Int = 8,
        nudgeOffsets: [TimeInterval] = [10 * 60, 25 * 60],
        fallbackTitle: String = "Reminder"
    ) {
        self.calendar = calendar
        self.limit = min(limit, Self.iOSPendingLimit)
        self.leadOccurrences = max(1, leadOccurrences)
        self.seriesOccurrences = max(1, seriesOccurrences)
        self.nudgeOffsets = nudgeOffsets.filter { $0 > 0 }
        self.fallbackTitle = fallbackTitle
    }

    public struct Plan: Sendable {
        public let notifications: [PlannedNotification]
        /// Колко напомняния не се побраха изобщо — UI-ът предупреждава за тях.
        public let skippedReminders: Int
        /// Колко се побраха само с едно задействане вместо с целия си шаблон.
        public let reducedReminders: Int

        public init(notifications: [PlannedNotification], skippedReminders: Int, reducedReminders: Int = 0) {
            self.notifications = notifications
            self.skippedReminders = skippedReminders
            self.reducedReminders = reducedReminders
        }
    }

    /// Най-близкото задействане на групата, сведено до една еднократна заявка.
    private func minimalRequest(from items: [PlannedNotification]) -> PlannedNotification? {
        guard let nearest = items.min(by: { $0.nextFireDate < $1.nextFireDate }) else { return nil }
        return PlannedNotification(
            requestID: Self.requestID(reminderID: nearest.reminderID, suffix: "budget"),
            reminderID: nearest.reminderID,
            title: nearest.title,
            body: nearest.body,
            nextFireDate: nearest.nextFireDate,
            dateComponents: exactComponents(nearest.nextFireDate),
            repeats: false,
            isImportant: nearest.isImportant
        )
    }

    public func plan(for reminders: [ReminderSnapshot], now: Date) -> Plan {
        let calculator = OccurrenceCalculator(calendar: calendar)

        // Групи по напомняне, подредени по най-близко задействане: режем цели
        // напомняния, а не половин напомняне (иначе „делници“ би останало с 2 от 5 дни).
        let groups: [(next: Date, items: [PlannedNotification])] =
            reminders
            .compactMap { reminder -> (Date, [PlannedNotification])? in
                let items = requests(for: reminder, now: now, calculator: calculator)
                guard let first = items.map(\.nextFireDate).min() else { return nil }
                return (first, items)
            }
            .sorted { $0.0 < $1.0 }

        var notifications: [PlannedNotification] = []
        var skipped = 0
        var reduced = 0
        for group in groups {
            if notifications.count + group.items.count <= limit {
                notifications.append(contentsOf: group.items)
            } else if notifications.count < limit, let fallback = minimalRequest(from: group.items) {
                // Цялата група не се побира. Пълното ѝ изхвърляне значи ВЕЧНО
                // мълчание за това напомняне: повтарящите се тригери не изтичат,
                // тоест мястото никога не се освобождава само. Затова му даваме
                // поне най-близкото задействане като еднократна заявка.
                notifications.append(fallback)
                reduced += 1
            } else {
                skipped += 1
            }
        }
        return Plan(
            notifications: notifications.sorted { $0.nextFireDate < $1.nextFireDate },
            skippedReminders: skipped,
            reducedReminders: reduced
        )
    }

    // MARK: - Заявки за едно напомняне

    private func requests(
        for reminder: ReminderSnapshot,
        now: Date,
        calculator: OccurrenceCalculator
    ) -> [PlannedNotification] {
        guard !reminder.isDone else { return [] }

        // Отложеното „за после“ е самостоятелна еднократна заявка — повтарящият
        // се тригер продължава да си върви непокътнат.
        var items: [PlannedNotification] = []
        if let snoozed = calculator.activeSnooze(of: reminder, after: now) {
            items.append(
                make(reminder, id: "snooze", fireDate: snoozed, components: exactComponents(snoozed), repeats: false)
            )
        }

        guard let next = calculator.patternOccurrence(of: reminder, after: now) else { return items }

        // Две положения искат поредица от отделни заявки вместо повтарящ се тригер:
        //  · повторението още не е започнало (тригерът би се задействал преди началото);
        //  · правилото няма нативен тригер („на всеки 3 дни“, „последния работен ден“) —
        //    те не са постоянен набор календарни компоненти.
        // Поредицата се допълва при всяко отваряне на приложението.
        let needsSeries =
            reminder.repeatRule.isRepeating
            && (reminder.fireDate > now || !reminder.repeatRule.hasNativeTrigger)
        if needsSeries {
            let count = reminder.repeatRule.hasNativeTrigger ? leadOccurrences : seriesOccurrences
            let dates = calculator.patternOccurrences(of: reminder, after: now, limit: count)
            items.append(
                contentsOf: dates.enumerated().map { index, date in
                    make(
                        reminder, id: "lead\(index)", fireDate: date, components: exactComponents(date), repeats: false)
                }
            )
            items.append(contentsOf: nudges(for: reminder, firing: next))
            return items
        }

        switch reminder.repeatRule {
        case .once:
            items.append(make(reminder, id: "once", fireDate: next, components: exactComponents(next), repeats: false))

        case .daily:
            items.append(
                make(
                    reminder, id: "daily", fireDate: next, components: timeComponents(reminder.fireDate), repeats: true)
            )

        case .weekly:
            var components = timeComponents(reminder.fireDate)
            components.weekday = calendar.component(.weekday, from: reminder.fireDate)
            items.append(make(reminder, id: "weekly", fireDate: next, components: components, repeats: true))

        case .weekdays:
            // Един повтарящ се тригер на делник — 5 заявки, но затова пък работят
            // безкрайно и без приложението да се отваря.
            items.append(
                contentsOf: OccurrenceCalculator.weekdayNumbers.compactMap { weekday in
                    var components = timeComponents(reminder.fireDate)
                    components.weekday = weekday
                    guard
                        let fire = calendar.nextDate(
                            after: now,
                            matching: components,
                            matchingPolicy: .nextTime,
                            repeatedTimePolicy: .first,
                            direction: .forward
                        )
                    else { return nil }
                    return make(reminder, id: "wd\(weekday)", fireDate: fire, components: components, repeats: true)
                }
            )

        case .monthly:
            var components = timeComponents(reminder.fireDate)
            components.day = calendar.component(.day, from: reminder.fireDate)
            items.append(make(reminder, id: "monthly", fireDate: next, components: components, repeats: true))

        case .yearly:
            var components = timeComponents(reminder.fireDate)
            components.day = calendar.component(.day, from: reminder.fireDate)
            components.month = calendar.component(.month, from: reminder.fireDate)
            items.append(make(reminder, id: "yearly", fireDate: next, components: components, repeats: true))

        case .everyNDays, .everyNWeeks, .lastWorkdayOfMonth:
            // Обработени по-горе (нямат нативен тригер) — тук не се стига.
            break
        }

        items.append(contentsOf: nudges(for: reminder, firing: next))
        return items
    }

    /// „Настойчивите“ повторни известия след основното.
    ///
    /// Само за важните: ако не потвърдиш, телефонът пита пак след 10 и 25 минути.
    /// Планират се за **следващото** задействане; щом натиснеш „Готово“, планът
    /// се пресинхронизира и заявките за отминалото задействане изчезват сами
    /// (новият план вече не ги съдържа).
    private func nudges(for reminder: ReminderSnapshot, firing next: Date) -> [PlannedNotification] {
        guard reminder.isImportant else { return [] }
        return nudgeOffsets.enumerated().compactMap { index, offset in
            let date = next.addingTimeInterval(offset)
            return make(
                reminder,
                id: "nudge\(index)",
                fireDate: date,
                components: exactComponents(date),
                repeats: false
            )
        }
    }

    private func make(
        _ reminder: ReminderSnapshot,
        id suffix: String,
        fireDate: Date,
        components: DateComponents,
        repeats: Bool
    ) -> PlannedNotification {
        PlannedNotification(
            requestID: Self.requestID(reminderID: reminder.id, suffix: suffix),
            reminderID: reminder.id,
            title: reminder.trimmedTitle ?? fallbackTitle,
            body: reminder.notificationBody,
            nextFireDate: fireDate,
            dateComponents: components,
            repeats: repeats,
            isImportant: reminder.isImportant
        )
    }

    private func timeComponents(_ date: Date) -> DateComponents {
        let parts = calendar.dateComponents([.hour, .minute], from: date)
        return DateComponents(hour: parts.hour, minute: parts.minute)
    }

    private func exactComponents(_ date: Date) -> DateComponents {
        var components = calendar.dateComponents([.year, .month, .day, .hour, .minute], from: date)
        // Без зона iOS тълкува компонентите в зоната, ДЕЙСТВАЩА при задействането:
        // насрочено за 08:30 в София и полетял до Токио → тригерът иска 08:30 JST,
        // което вече е минало, и известието изобщо не идва. Повтарящите се тригери
        // нарочно остават без зона — там верният смисъл е стенният час „всеки ден в 7“.
        components.timeZone = calendar.timeZone
        return components
    }

    // MARK: - Идентификатори

    static let separator = "|"

    public static func requestID(reminderID: UUID, suffix: String) -> String {
        "\(reminderID.uuidString)\(separator)\(suffix)"
    }

    /// Обратният път: от идентификатора на известието към записа в базата.
    public static func reminderID(fromRequestID requestID: String) -> UUID? {
        guard let head = requestID.split(separator: Character(separator), maxSplits: 1).first else { return nil }
        return UUID(uuidString: String(head))
    }
}
