import Foundation

@testable import KarakochevCore

/// Всички тестове работят с фиксиран календар (Европа/София, григориански),
/// за да не зависят от настройките на машината, която ги пуска.
enum Fixture {
    static var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Europe/Sofia")!
        calendar.locale = Locale(identifier: "bg_BG")
        return calendar
    }

    static func date(_ year: Int, _ month: Int, _ day: Int, _ hour: Int = 0, _ minute: Int = 0) -> Date {
        var components = DateComponents()
        components.year = year
        components.month = month
        components.day = day
        components.hour = hour
        components.minute = minute
        guard let date = calendar.date(from: components) else {
            fatalError("невалидна тестова дата \(year)-\(month)-\(day) \(hour):\(minute)")
        }
        return date
    }

    static func reminder(
        title: String = "Плащане на ток",
        note: String = "",
        at date: Date,
        repeat rule: RepeatRule = .once,
        isDone: Bool = false,
        isImportant: Bool = false,
        id: UUID = UUID()
    ) -> ReminderSnapshot {
        ReminderSnapshot(
            id: id,
            title: title,
            note: note,
            fireDate: date,
            repeatRule: rule,
            isDone: isDone,
            isImportant: isImportant
        )
    }

    /// Разкъсва датата на части в тестовия календар — за четими проверки.
    static func parts(_ date: Date) -> (year: Int, month: Int, day: Int, hour: Int, minute: Int, weekday: Int) {
        let c = calendar.dateComponents([.year, .month, .day, .hour, .minute, .weekday], from: date)
        return (c.year!, c.month!, c.day!, c.hour!, c.minute!, c.weekday!)
    }
}
