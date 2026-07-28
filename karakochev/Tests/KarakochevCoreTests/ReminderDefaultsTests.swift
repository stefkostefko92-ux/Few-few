import Foundation
import Testing

@testable import KarakochevCore

@Suite("Стойности по подразбиране")
struct ReminderDefaultsTests {
    @Test("Предложеният час е следващият кръгъл час")
    func suggestedDateIsNextFullHour() {
        let now = Fixture.date(2026, 8, 10, 9, 17)
        let suggested = ReminderDefaults.suggestedDate(now: now, calendar: Fixture.calendar)
        #expect(suggested == Fixture.date(2026, 8, 10, 10, 0))
    }

    @Test("Предложеният час никога не е в миналото")
    func suggestedDateIsNeverInThePast() {
        for minute in [0, 1, 30, 59] {
            let now = Fixture.date(2026, 8, 10, 23, minute)
            let suggested = ReminderDefaults.suggestedDate(now: now, calendar: Fixture.calendar)
            #expect(suggested > now)
        }
    }

    @Test("Еднократна записка с минал час се маркира като безсмислена")
    func warningForPastOnce() {
        let now = Fixture.date(2026, 8, 10, 9, 0)
        #expect(ReminderDefaults.warning(for: Fixture.date(2026, 8, 9, 9, 0), rule: .once, now: now) == .pastOneOff)
        #expect(ReminderDefaults.warning(for: Fixture.date(2026, 8, 11, 9, 0), rule: .once, now: now) == nil)
    }

    @Test("Повтарящата се записка с минало начало е нормална — без предупреждение")
    func noWarningForRepeatingWithPastStart() {
        let now = Fixture.date(2026, 8, 10, 9, 0)
        #expect(ReminderDefaults.warning(for: Fixture.date(2026, 1, 1, 7, 0), rule: .daily, now: now) == nil)
    }
}
