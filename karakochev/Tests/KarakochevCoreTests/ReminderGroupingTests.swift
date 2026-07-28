import Foundation
import Testing

@testable import KarakochevCore

@Suite("Списък: раздели, подредба и търсене")
struct ReminderGroupingTests {
    let grouping = ReminderGrouping(calendar: Fixture.calendar)
    let now = Fixture.date(2026, 8, 10, 9, 0)

    @Test("Всяко напомняне попада в своя раздел")
    func sectionsAreAssigned() {
        let reminders = [
            Fixture.reminder(title: "Просрочено", at: Fixture.date(2026, 8, 1, 8, 0)),
            Fixture.reminder(title: "Днес", at: Fixture.date(2026, 8, 10, 18, 0)),
            Fixture.reminder(title: "Утре", at: Fixture.date(2026, 8, 11, 9, 0)),
            Fixture.reminder(title: "Другата седмица", at: Fixture.date(2026, 8, 20, 9, 0)),
            Fixture.reminder(title: "Готово", at: Fixture.date(2026, 8, 25, 9, 0), isDone: true),
        ]
        let groups = grouping.group(reminders, now: now)

        #expect(groups.map(\.section) == [.overdue, .today, .tomorrow, .upcoming, .done])
        let oneEach = groups.allSatisfy { $0.items.count == 1 }
        #expect(oneEach)
    }

    @Test("Предстоящите са подредени с най-близкото първо")
    func upcomingIsAscending() {
        let reminders = [
            Fixture.reminder(title: "След две седмици", at: Fixture.date(2026, 8, 24, 9, 0)),
            Fixture.reminder(title: "Вдругиден", at: Fixture.date(2026, 8, 12, 9, 0)),
        ]
        let upcoming = grouping.group(reminders, now: now).first { $0.section == .upcoming }
        #expect(upcoming?.items.map(\.title) == ["Вдругиден", "След две седмици"])
    }

    @Test("Просрочените са подредени с най-скорошното първо")
    func overdueIsDescending() {
        let reminders = [
            Fixture.reminder(title: "Отдавна", at: Fixture.date(2026, 7, 1, 9, 0)),
            Fixture.reminder(title: "Вчера", at: Fixture.date(2026, 8, 9, 9, 0)),
        ]
        let overdue = grouping.group(reminders, now: now).first { $0.section == .overdue }
        #expect(overdue?.items.map(\.title) == ["Вчера", "Отдавна"])
    }

    @Test("Повтарящо се напомняне с минало начало е предстоящо, не просрочено")
    func repeatingIsNeverOverdue() {
        let reminder = Fixture.reminder(title: "Хапчета", at: Fixture.date(2026, 1, 1, 20, 0), repeat: .daily)
        let groups = grouping.group([reminder], now: now)
        #expect(groups.map(\.section) == [.today])
    }

    @Test("Празните раздели не се показват")
    func emptySectionsAreOmitted() {
        #expect(grouping.group([], now: now).isEmpty)
    }

    @Test("Търсенето не гледа регистър и диакритика")
    func searchIsForgiving() {
        let reminders = [
            Fixture.reminder(title: "Плащане на ток", at: now),
            Fixture.reminder(title: "Смяна на гуми", note: "При Гьоре", at: now),
        ]
        #expect(grouping.search(reminders, query: "плащане").count == 1)
        #expect(grouping.search(reminders, query: "ГЬОРЕ").count == 1)  // намира и по бележката
        #expect(grouping.search(reminders, query: "гьоре").count == 1)
        #expect(grouping.search(reminders, query: "   ").count == 2)  // празно търсене → всичко
        #expect(grouping.search(reminders, query: "нищо такова").isEmpty)
    }
}

@Suite("Текст за датата и отлагане")
struct DateTextAndSnoozeTests {
    let text = ReminderDateText(calendar: Fixture.calendar, locale: Locale(identifier: "bg_BG"))
    let now = Fixture.date(2026, 8, 10, 9, 0)

    @Test("Денят се разпознава правилно")
    func buckets() {
        #expect(text.bucket(for: Fixture.date(2026, 8, 10, 23, 59), now: now) == .today)
        #expect(text.bucket(for: Fixture.date(2026, 8, 11, 0, 1), now: now) == .tomorrow)
        #expect(text.bucket(for: Fixture.date(2026, 8, 9, 23, 0), now: now) == .yesterday)
        #expect(text.bucket(for: Fixture.date(2026, 8, 14, 9, 0), now: now) == .withinWeek)
        #expect(text.bucket(for: Fixture.date(2026, 8, 30, 9, 0), now: now) == .later)
        #expect(text.bucket(for: Fixture.date(2026, 8, 1, 9, 0), now: now) == .later)
    }

    @Test("Границата ден/седмица е точно между +6 и +7 дни, независимо от часа")
    func bucketWeekBoundaryIsExact() {
        // „Сега“ е в полунощ нарочно — проверява границата по цели дни, не по часа.
        let midnight = Fixture.date(2026, 8, 10, 0, 0)
        #expect(text.bucket(for: Fixture.date(2026, 8, 16, 23, 59), now: midnight) == .withinWeek)  // +6 дни
        #expect(text.bucket(for: Fixture.date(2026, 8, 17, 0, 0), now: midnight) == .later)  // +7 дни
        #expect(text.bucket(for: midnight, now: midnight) == .today)  // самият момент „сега“
    }

    @Test("Текстът за днес и утре е на български")
    func textIsBulgarian() {
        #expect(text.text(for: Fixture.date(2026, 8, 10, 14, 30), now: now).hasPrefix("днес в "))
        #expect(text.text(for: Fixture.date(2026, 8, 11, 9, 0), now: now).hasPrefix("утре в "))
    }

    @Test("Отлагането с 10 минути и с час мести точно")
    func shortSnooze() {
        #expect(
            SnoozeOption.tenMinutes.nextDate(from: now, calendar: Fixture.calendar) == Fixture.date(2026, 8, 10, 9, 10))
        #expect(
            SnoozeOption.oneHour.nextDate(from: now, calendar: Fixture.calendar) == Fixture.date(2026, 8, 10, 10, 0))
    }

    @Test("„Довечера“ след 19:00 отива на следващата вечер, не в миналото")
    func tonightNeverLandsInThePast() {
        let late = Fixture.date(2026, 8, 10, 21, 0)
        #expect(
            SnoozeOption.tonight.nextDate(from: late, calendar: Fixture.calendar) == Fixture.date(2026, 8, 11, 19, 0))
        #expect(
            SnoozeOption.tonight.nextDate(from: now, calendar: Fixture.calendar) == Fixture.date(2026, 8, 10, 19, 0))
    }

    @Test("„Утре сутрин“ е утре в 09:00")
    func tomorrowMorning() {
        #expect(
            SnoozeOption.tomorrowMorning.nextDate(from: Fixture.date(2026, 8, 10, 23, 30), calendar: Fixture.calendar)
                == Fixture.date(2026, 8, 11, 9, 0)
        )
    }
}
