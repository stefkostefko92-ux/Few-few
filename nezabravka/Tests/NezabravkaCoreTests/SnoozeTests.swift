import Foundation
import Testing

@testable import NezabravkaCore

@Suite("Отложени напомняния")
struct SnoozeTests {
    let calculator = OccurrenceCalculator(calendar: Fixture.calendar)
    let planner = NotificationPlanner(calendar: Fixture.calendar)
    let now = Fixture.date(2026, 8, 10, 9, 0)

    /// Отлагането се пази в записа, а не като „висящо“ известие — затова
    /// преживява рестарт и пресинхронизация на плана.
    @Test("Просрочено, но отложено напомняне пак се задейства")
    func snoozeRevivesOverdue() {
        var reminder = Fixture.reminder(at: Fixture.date(2026, 8, 9, 8, 0))
        reminder.snoozedUntil = Fixture.date(2026, 8, 10, 18, 0)

        #expect(calculator.nextOccurrence(of: reminder, after: now) == Fixture.date(2026, 8, 10, 18, 0))
        #expect(calculator.isOverdue(reminder, now: now) == false)

        let plan = planner.plan(for: [reminder], now: now)
        #expect(plan.notifications.count == 1)
        #expect(plan.notifications[0].repeats == false)
        #expect(plan.notifications[0].nextFireDate == Fixture.date(2026, 8, 10, 18, 0))
    }

    @Test("Отлагането не спира повтарящия се тригер — добавя се към него")
    func snoozeKeepsRepeatingTrigger() {
        var reminder = Fixture.reminder(at: Fixture.date(2026, 8, 1, 7, 0), repeat: .daily)
        reminder.snoozedUntil = Fixture.date(2026, 8, 10, 9, 30)

        let plan = planner.plan(for: [reminder], now: now)
        #expect(plan.notifications.count == 2)
        #expect(plan.notifications.filter(\.repeats).count == 1)  // дневният тригер си върви
        #expect(plan.notifications[0].nextFireDate == Fixture.date(2026, 8, 10, 9, 30))  // отложеното е първо
    }

    @Test("Минало отлагане се игнорира")
    func expiredSnoozeIsIgnored() {
        var reminder = Fixture.reminder(at: Fixture.date(2026, 8, 9, 8, 0))
        reminder.snoozedUntil = Fixture.date(2026, 8, 10, 8, 0)  // преди „сега“
        #expect(calculator.nextOccurrence(of: reminder, after: now) == nil)
        #expect(planner.plan(for: [reminder], now: now).notifications.isEmpty)
    }

    @Test("Приключеното напомняне не се събужда от отлагане")
    func doneBeatsSnooze() {
        var reminder = Fixture.reminder(at: Fixture.date(2026, 8, 9, 8, 0), isDone: true)
        reminder.snoozedUntil = Fixture.date(2026, 8, 11, 8, 0)
        #expect(calculator.nextOccurrence(of: reminder, after: now) == nil)
        #expect(planner.plan(for: [reminder], now: now).notifications.isEmpty)
    }

    @Test("Отложеното напомняне влиза в раздела на новия си час")
    func snoozedIsGroupedByNewTime() {
        var reminder = Fixture.reminder(at: Fixture.date(2026, 8, 9, 8, 0))
        reminder.snoozedUntil = Fixture.date(2026, 8, 11, 8, 0)
        let groups = ReminderGrouping(calendar: Fixture.calendar).group([reminder], now: now)
        #expect(groups.map(\.section) == [.tomorrow])
    }
}
