import Foundation
import Testing

@testable import NezabravkaCore

@Suite("Сметки за задействане")
struct OccurrenceCalculatorTests {
    let calculator = OccurrenceCalculator(calendar: Fixture.calendar)

    @Test("Еднократно напомняне в бъдещето се задейства на своята дата")
    func onceInFuture() {
        let fire = Fixture.date(2026, 8, 12, 8, 30)
        let reminder = Fixture.reminder(at: fire)
        #expect(calculator.nextOccurrence(of: reminder, after: Fixture.date(2026, 8, 1, 12, 0)) == fire)
    }

    @Test("Еднократно напомняне в миналото няма следващо задействане (просрочено)")
    func onceInPast() {
        let reminder = Fixture.reminder(at: Fixture.date(2026, 8, 12, 8, 30))
        let now = Fixture.date(2026, 8, 13, 9, 0)
        #expect(calculator.nextOccurrence(of: reminder, after: now) == nil)
        #expect(calculator.isOverdue(reminder, now: now))
    }

    @Test("Приключеното напомняне не се задейства повече")
    func doneNeverFires() {
        let reminder = Fixture.reminder(at: Fixture.date(2026, 8, 12, 8, 30), repeat: .daily, isDone: true)
        #expect(calculator.nextOccurrence(of: reminder, after: Fixture.date(2026, 8, 1)) == nil)
    }

    @Test("Ежедневното напомняне минава на утре, щом днешният час е минал")
    func dailyRollsOver() {
        let reminder = Fixture.reminder(at: Fixture.date(2026, 8, 1, 7, 0), repeat: .daily)
        let next = calculator.nextOccurrence(of: reminder, after: Fixture.date(2026, 8, 10, 9, 0))
        #expect(next == Fixture.date(2026, 8, 11, 7, 0))
    }

    @Test("Ежедневното напомняне пази часа през смяната на лятното време")
    func dailyKeepsLocalTimeAcrossDST() {
        // Европа/София минава на лятно време в нощта на 29 март 2026 (03:00 → 04:00).
        let reminder = Fixture.reminder(at: Fixture.date(2026, 3, 1, 9, 0), repeat: .daily)
        let next = calculator.nextOccurrence(of: reminder, after: Fixture.date(2026, 3, 28, 12, 0))
        let parts = Fixture.parts(next!)
        #expect(parts.day == 29)
        #expect(parts.hour == 9)  // а не 8 или 10
    }

    @Test("Седмичното напомняне пази деня от седмицата")
    func weeklyKeepsWeekday() {
        let start = Fixture.date(2026, 8, 4, 18, 0)  // вторник
        let reminder = Fixture.reminder(at: start, repeat: .weekly)
        let next = calculator.nextOccurrence(of: reminder, after: Fixture.date(2026, 8, 5, 0, 0))
        #expect(next == Fixture.date(2026, 8, 11, 18, 0))
        #expect(Fixture.parts(next!).weekday == Fixture.parts(start).weekday)
    }

    @Test("„Всеки делник“ прескача събота и неделя")
    func weekdaysSkipWeekend() {
        let reminder = Fixture.reminder(at: Fixture.date(2026, 8, 3, 7, 30), repeat: .weekdays)
        // Петък след часа → следващото е понеделник.
        let next = calculator.nextOccurrence(of: reminder, after: Fixture.date(2026, 8, 7, 8, 0))
        #expect(next == Fixture.date(2026, 8, 10, 7, 30))

        let series = calculator.occurrences(of: reminder, after: Fixture.date(2026, 8, 3, 8, 0), limit: 5)
        let weekdays = series.map { Fixture.parts($0).weekday }
        let onlyWorkdays = weekdays.allSatisfy { OccurrenceCalculator.weekdayNumbers.contains($0) }
        #expect(onlyWorkdays)
        #expect(series.count == 5)
    }

    @Test("Месечно на 31-во число прескача месеците без 31-ви")
    func monthlySkipsShortMonths() {
        let reminder = Fixture.reminder(at: Fixture.date(2026, 1, 31, 10, 0), repeat: .monthly)
        let next = calculator.nextOccurrence(of: reminder, after: Fixture.date(2026, 2, 1, 0, 0))
        #expect(next == Fixture.date(2026, 3, 31, 10, 0))  // не 28 февруари
    }

    @Test("Годишно на 29 февруари се задейства само високосна година")
    func yearlyLeapDay() {
        let reminder = Fixture.reminder(at: Fixture.date(2024, 2, 29, 12, 0), repeat: .yearly)
        let next = calculator.nextOccurrence(of: reminder, after: Fixture.date(2025, 1, 1))
        #expect(next == Fixture.date(2028, 2, 29, 12, 0))
    }

    @Test("Повторение с начало в бъдещето започва от началната дата, не по-рано")
    func futureStartIsRespected() {
        let start = Fixture.date(2026, 9, 1, 9, 0)
        let reminder = Fixture.reminder(at: start, repeat: .daily)
        // Ако не пазехме началото, шаблонът „всеки ден в 9:00“ би дал 11 август.
        #expect(calculator.nextOccurrence(of: reminder, after: Fixture.date(2026, 8, 10, 12, 0)) == start)
    }

    @Test("Поредицата от задействания е възходяща и без повторения")
    func seriesIsAscending() {
        let reminder = Fixture.reminder(at: Fixture.date(2026, 8, 1, 6, 0), repeat: .daily)
        let series = calculator.occurrences(of: reminder, after: Fixture.date(2026, 8, 1, 7, 0), limit: 4)
        #expect(
            series == [
                Fixture.date(2026, 8, 2, 6, 0),
                Fixture.date(2026, 8, 3, 6, 0),
                Fixture.date(2026, 8, 4, 6, 0),
                Fixture.date(2026, 8, 5, 6, 0),
            ])
    }

    @Test("Еднократното дава най-много едно задействане в поредицата")
    func onceYieldsSingleOccurrence() {
        let reminder = Fixture.reminder(at: Fixture.date(2026, 8, 20, 10, 0))
        let series = calculator.occurrences(of: reminder, after: Fixture.date(2026, 8, 1), limit: 5)
        #expect(series.count == 1)
    }

    // MARK: - Часови зони и лятно време

    @Test("Ежедневното напомняне пази часа през връщането на зимното време")
    func dailyKeepsLocalTimeAcrossFallBack() {
        // Европа/София се връща на зимно време в нощта на 25 октомври 2026 (04:00 → 03:00) —
        // 03:30 се случва два пъти; политиката `.first` избира първото случване.
        let reminder = Fixture.reminder(at: Fixture.date(2026, 10, 1, 3, 30), repeat: .daily)
        let next = calculator.nextOccurrence(of: reminder, after: Fixture.date(2026, 10, 24, 12, 0))
        let parts = Fixture.parts(next!)
        #expect(parts.day == 25)
        #expect(parts.hour == 3)
        #expect(parts.minute == 30)
    }

    @Test("Седмичното напомняне на несъществуващ час при смяна на лятното време се измества напред")
    func weeklyHandlesNonexistentTimeAtSpringForward() {
        // Европа/София минава на лятно време в нощта на 29 март 2026 (03:00 → 04:00) —
        // 03:30 просто не съществува локално този ден. `Calendar` (matchingPolicy `.nextTime`)
        // го измества напред до 04:00, а не го пропуска или чупи.
        let start = Fixture.date(2026, 3, 22, 3, 30)  // неделя, седмица преди прехода
        let reminder = Fixture.reminder(at: start, repeat: .weekly)
        let next = calculator.nextOccurrence(of: reminder, after: Fixture.date(2026, 3, 23, 0, 0))
        let parts = Fixture.parts(next!)
        #expect(parts.day == 29)
        #expect(parts.hour == 4)
        #expect(parts.minute == 0)
        #expect(parts.weekday == Fixture.parts(start).weekday)
    }

    // MARK: - „Всеки делник“ около граници на месец/година

    @Test("„Всеки делник“ минава коректно през границата на годината")
    func weekdaysCrossYearBoundary() {
        // 31 декември 2026 е четвъртък, 1 януари 2027 е петък — следващият делник.
        let reminder = Fixture.reminder(at: Fixture.date(2026, 12, 3, 8, 0), repeat: .weekdays)
        let next = calculator.nextOccurrence(of: reminder, after: Fixture.date(2026, 12, 31, 9, 0))
        #expect(next == Fixture.date(2027, 1, 1, 8, 0))
    }

    @Test("„Всеки делник“ не зависи от това дали седмицата започва в неделя или понеделник")
    func weekdaysIndependentOfFirstWeekday() {
        // Разделянето на делник/уикенд е по номер на деня (`weekdayNumbers`), не по
        // позиция в седмицата — резултатът трябва да е един и същ и с двете настройки.
        let reminder = Fixture.reminder(at: Fixture.date(2026, 12, 3, 8, 0), repeat: .weekdays)
        let now = Fixture.date(2026, 12, 31, 9, 0)

        var sundayFirst = Fixture.calendar
        sundayFirst.firstWeekday = 1
        var mondayFirst = Fixture.calendar
        mondayFirst.firstWeekday = 2

        let sundayResult = OccurrenceCalculator(calendar: sundayFirst).nextOccurrence(of: reminder, after: now)
        let mondayResult = OccurrenceCalculator(calendar: mondayFirst).nextOccurrence(of: reminder, after: now)
        #expect(sundayResult == mondayResult)
    }

    @Test("Месечно на 30-о число прескача февруари, но не и по-дългите месеци около него")
    func monthlyDay30SkipsFebruary() {
        let reminder = Fixture.reminder(at: Fixture.date(2026, 1, 30, 10, 0), repeat: .monthly)
        let next = calculator.nextOccurrence(of: reminder, after: Fixture.date(2026, 2, 1, 0, 0))
        #expect(next == Fixture.date(2026, 3, 30, 10, 0))  // не 28 февруари
    }
}
