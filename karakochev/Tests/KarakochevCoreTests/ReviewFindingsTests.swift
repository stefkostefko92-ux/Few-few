import Foundation
import Testing

@testable import KarakochevCore

/// Регресии по находки от вътрешното ревю (Кодаджията, 28.07.2026).
/// Всеки тест пази поведение, което вече веднъж е било сгрешено.
@Suite("Регресии от ревюто")
struct ReviewFindingsTests {
    let calculator = OccurrenceCalculator(calendar: Fixture.calendar)
    let planner = NotificationPlanner(calendar: Fixture.calendar)
    let now = Fixture.date(2026, 8, 10, 9, 0)  // понеделник

    @Test("„Всеки делник“ с начало в събота НЕ се задейства през уикенда")
    func weekdaysStartingOnWeekendSkipsToMonday() {
        // 15 август 2026 е събота. Потребител, избрал я за начало на „всеки
        // делник“, не бива да получи известие в събота.
        let saturday = Fixture.date(2026, 8, 15, 9, 0)
        #expect(Fixture.parts(saturday).weekday == 7)

        let reminder = Fixture.reminder(at: saturday, repeat: .weekdays)
        let next = calculator.nextOccurrence(of: reminder, after: now)
        #expect(next == Fixture.date(2026, 8, 17, 9, 0))  // понеделник

        let plan = planner.plan(for: [reminder], now: now)
        let weekdays = plan.notifications.map { Fixture.parts($0.nextFireDate).weekday }
        let onlyWorkdays = weekdays.allSatisfy { OccurrenceCalculator.weekdayNumbers.contains($0) }
        #expect(onlyWorkdays)
    }

    @Test("„Всеки делник“ с начало в неделя също прескача на понеделник")
    func weekdaysStartingOnSundaySkipsToMonday() {
        let sunday = Fixture.date(2026, 8, 16, 7, 30)
        #expect(Fixture.parts(sunday).weekday == 1)

        let reminder = Fixture.reminder(at: sunday, repeat: .weekdays)
        #expect(calculator.nextOccurrence(of: reminder, after: now) == Fixture.date(2026, 8, 17, 7, 30))
    }

    @Test("Начало в делник си остава непокътнато")
    func weekdaysStartingOnWorkdayIsUnchanged() {
        let wednesday = Fixture.date(2026, 8, 12, 6, 45)
        let reminder = Fixture.reminder(at: wednesday, repeat: .weekdays)
        #expect(calculator.nextOccurrence(of: reminder, after: now) == wednesday)
    }

    @Test("Повтарящите се правила извън „делници“ не се пипат от проверката")
    func otherRulesKeepTheirStartDate() {
        let saturday = Fixture.date(2026, 8, 15, 9, 0)
        for rule in [RepeatRule.daily, .weekly, .monthly, .yearly] {
            let reminder = Fixture.reminder(at: saturday, repeat: rule)
            #expect(calculator.nextOccurrence(of: reminder, after: now) == saturday)
        }
    }

    @Test("Планер: седмичното пази деня от седмицата в тригера")
    func weeklyTriggerCarriesWeekday() {
        let tuesday = Fixture.date(2026, 8, 4, 18, 0)
        let plan = planner.plan(for: [Fixture.reminder(at: tuesday, repeat: .weekly)], now: now)
        #expect(plan.notifications.count == 1)
        #expect(plan.notifications[0].dateComponents.weekday == 3)
        #expect(plan.notifications[0].dateComponents.day == nil)
    }

    @Test("Планер: месечното носи число, но не и месец")
    func monthlyTriggerCarriesDayOnly() {
        let plan = planner.plan(
            for: [Fixture.reminder(at: Fixture.date(2026, 1, 31, 10, 0), repeat: .monthly)], now: now)
        #expect(plan.notifications[0].dateComponents.day == 31)
        #expect(plan.notifications[0].dateComponents.month == nil)
    }

    @Test("Планер: годишното носи и месец, и число")
    func yearlyTriggerCarriesMonthAndDay() {
        let plan = planner.plan(
            for: [Fixture.reminder(at: Fixture.date(2024, 2, 29, 12, 0), repeat: .yearly)], now: now)
        #expect(plan.notifications[0].dateComponents.month == 2)
        #expect(plan.notifications[0].dateComponents.day == 29)
    }
}
