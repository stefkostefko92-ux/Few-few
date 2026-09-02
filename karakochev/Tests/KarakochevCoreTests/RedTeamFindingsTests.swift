import Foundation
import Testing

@testable import KarakochevCore

/// Регресии по атаките на червения екип (Разбивача, 28.07.2026).
@Suite("Регресии от червения екип")
struct RedTeamFindingsTests {
    let planner = NotificationPlanner(calendar: Fixture.calendar)
    let now = Fixture.date(2026, 8, 10, 9, 0)

    // MARK: - Часова зона

    @Test("Еднократното известие носи часовата си зона — оцелява полет до друг часови пояс")
    func exactTriggerCarriesTimeZone() {
        let reminder = Fixture.reminder(at: Fixture.date(2026, 8, 12, 8, 30))
        let request = planner.plan(for: [reminder], now: now).notifications[0]

        // Без зона iOS би тълкувал „08:30“ в зоната на задействането: в Токио
        // това е минал час и известие изобщо няма да има.
        #expect(request.dateComponents.timeZone == TimeZone(identifier: "Europe/Sofia"))

        var tokyo = Calendar(identifier: .gregorian)
        tokyo.timeZone = TimeZone(identifier: "Asia/Tokyo")!
        #expect(tokyo.date(from: request.dateComponents) == Fixture.date(2026, 8, 12, 8, 30))
    }

    @Test("Повтарящият се тригер НЕ носи зона — там верният смисъл е стенният час")
    func repeatingTriggerStaysWallClock() {
        let reminder = Fixture.reminder(at: Fixture.date(2026, 8, 1, 7, 0), repeat: .daily)
        let request = planner.plan(for: [reminder], now: now).notifications[0]
        #expect(request.repeats)
        #expect(request.dateComponents.timeZone == nil)
    }

    @Test("Отложената заявка също носи зона")
    func snoozeRequestCarriesTimeZone() {
        var reminder = Fixture.reminder(at: Fixture.date(2026, 8, 9, 8, 0))
        reminder.snoozedUntil = Fixture.date(2026, 8, 10, 18, 0)
        let request = planner.plan(for: [reminder], now: now).notifications[0]
        #expect(request.dateComponents.timeZone != nil)
    }

    // MARK: - Бюджетът на iOS

    @Test("Непобралото се напомняне пак получава известие — не мълчи завинаги")
    func crowdedOutReminderStillGetsOneNotification() {
        // 12 напомняния „всеки делник“ = 60 заявки при бюджет 56: класическият
        // случай, в който повтарящите се тригери не изтичат и мястото никога
        // не се освобождава само.
        let tight = NotificationPlanner(calendar: Fixture.calendar, limit: 8)
        let reminders = (1...3).map { index in
            Fixture.reminder(title: "Делници \(index)", at: Fixture.date(2026, 8, 3, 6 + index, 0), repeat: .weekdays)
        }
        let plan = tight.plan(for: reminders, now: now)

        // Първото влиза цяло (5 заявки), другите две получават по една резервна.
        #expect(plan.reducedReminders == 2)
        #expect(plan.skippedReminders == 0)  // никое не остава без нищо
        let covered = Set(plan.notifications.map(\.reminderID))
        #expect(covered.count == 3)
    }

    @Test("Резервната заявка е еднократна, с точна дата и зона")
    func fallbackRequestIsExact() {
        let tight = NotificationPlanner(calendar: Fixture.calendar, limit: 6)
        let reminders = [
            Fixture.reminder(title: "Първо", at: Fixture.date(2026, 8, 3, 7, 0), repeat: .weekdays),
            Fixture.reminder(title: "Второ", at: Fixture.date(2026, 8, 3, 8, 0), repeat: .weekdays),
        ]
        let plan = tight.plan(for: reminders, now: now)
        let fallback = plan.notifications.first { $0.requestID.hasSuffix("|budget") }

        #expect(fallback != nil)
        #expect(fallback?.repeats == false)
        #expect(fallback?.dateComponents.timeZone != nil)
        #expect(fallback?.dateComponents.day != nil)
    }

    @Test("Когато и една заявка не се побира, напомнянето се брои за пропуснато")
    func fullBudgetStillReportsSkipped() {
        let tiny = NotificationPlanner(calendar: Fixture.calendar, limit: 1)
        let reminders = [
            Fixture.reminder(title: "Първо", at: Fixture.date(2026, 8, 11, 8, 0)),
            Fixture.reminder(title: "Второ", at: Fixture.date(2026, 8, 12, 8, 0)),
        ]
        let plan = tiny.plan(for: reminders, now: now)

        #expect(plan.notifications.count == 1)
        #expect(plan.skippedReminders == 1)
        #expect(plan.reducedReminders == 0)
    }

    @Test("Планът никога не надхвърля бюджета, дори с резервни заявки")
    func budgetIsNeverExceeded() {
        for limit in 1...12 {
            let planner = NotificationPlanner(calendar: Fixture.calendar, limit: limit)
            let reminders = (1...10).map { index in
                Fixture.reminder(title: "Делници \(index)", at: Fixture.date(2026, 8, 3, 7, 0), repeat: .weekdays)
            }
            let plan = planner.plan(for: reminders, now: now)
            #expect(plan.notifications.count <= limit)
        }
    }

    @Test("Всяко напомняне се появява най-много веднъж като резервна заявка")
    func fallbackIdentifiersStayUnique() {
        let tight = NotificationPlanner(calendar: Fixture.calendar, limit: 7)
        let reminders = (1...4).map { index in
            Fixture.reminder(title: "Делници \(index)", at: Fixture.date(2026, 8, 3, 6 + index, 0), repeat: .weekdays)
        }
        let ids = tight.plan(for: reminders, now: now).notifications.map(\.requestID)
        #expect(Set(ids).count == ids.count)
    }
}
