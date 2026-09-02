import Foundation
import Testing

@testable import KarakochevCore

@Suite("Разпознаване на час от текста")
struct ReminderTextParserTests {
    /// Понеделник, 10 август 2026, 09:00.
    let now = Fixture.date(2026, 8, 10, 9, 0)

    func parser(_ language: ReminderTextParser.Language) -> ReminderTextParser {
        ReminderTextParser(calendar: Fixture.calendar, language: language)
    }

    // MARK: - Български

    @Test("„плащане на ток вторник в 8“ → вторник 08:00, заглавието остава чисто")
    func bulgarianWeekdayAndHour() {
        let result = parser(.bulgarian).parse("плащане на ток вторник в 8", now: now)
        #expect(result.date == Fixture.date(2026, 8, 11, 8, 0))
        #expect(result.title == "плащане на ток")
        #expect(result.repeatRule == nil)
    }

    @Test("„утре в 14:30“ хваща и деня, и минутите")
    func bulgarianTomorrowWithMinutes() {
        let result = parser(.bulgarian).parse("вземи детето утре в 14:30", now: now)
        #expect(result.date == Fixture.date(2026, 8, 11, 14, 30))
        #expect(result.title == "вземи детето")
    }

    @Test("„след 2 часа“ мести спрямо сега")
    func bulgarianRelativeHours() {
        let result = parser(.bulgarian).parse("извади прането след 2 часа", now: now)
        #expect(result.date == Fixture.date(2026, 8, 10, 11, 0))
        #expect(result.title == "извади прането")
    }

    @Test("„след 30 минути“ мести с минути")
    func bulgarianRelativeMinutes() {
        let result = parser(.bulgarian).parse("обади се след 30 минути", now: now)
        #expect(result.date == Fixture.date(2026, 8, 10, 9, 30))
    }

    @Test("„всеки ден в 20:00“ дава ежедневно повторение")
    func bulgarianDaily() {
        let result = parser(.bulgarian).parse("хапчета всеки ден в 20:00", now: now)
        #expect(result.repeatRule == .daily)
        #expect(result.date == Fixture.date(2026, 8, 10, 20, 0))
        #expect(result.title == "хапчета")
    }

    @Test("„на всеки 3 дни“ дава правило с брой")
    func bulgarianEveryNDays() {
        let result = parser(.bulgarian).parse("полей цветята на всеки 3 дни", now: now)
        #expect(result.repeatRule == .everyNDays)
        #expect(result.interval == 3)
        #expect(result.title == "полей цветята")
    }

    @Test("„всеки понеделник“ дава седмично в понеделник")
    func bulgarianEveryMonday() {
        let result = parser(.bulgarian).parse("отчет всеки понеделник в 9", now: now)
        #expect(result.repeatRule == .weekly)
        #expect(result.date == Fixture.date(2026, 8, 10, 9, 0))
    }

    @Test("„всеки делник“ дава делнично повторение")
    func bulgarianWeekdays() {
        let result = parser(.bulgarian).parse("витамини всеки делник", now: now)
        #expect(result.repeatRule == .weekdays)
        #expect(result.title == "витамини")
    }

    @Test("„сутринта“ и „вечерта“ дават час без да се пише число")
    func bulgarianDayParts() {
        #expect(parser(.bulgarian).parse("бягане утре сутринта", now: now).date == Fixture.date(2026, 8, 11, 9, 0))
        #expect(parser(.bulgarian).parse("лекарство довечера", now: now).date == Fixture.date(2026, 8, 10, 19, 0))
    }

    @Test("„15 август“ и „15.09“ дават дата")
    func bulgarianExplicitDates() {
        #expect(parser(.bulgarian).parse("рожден ден 15 август", now: now).date == Fixture.date(2026, 8, 15, 9, 0))
        #expect(parser(.bulgarian).parse("такса 15.09", now: now).date == Fixture.date(2026, 9, 15, 9, 0))
    }

    @Test("Минала дата в годината отива на следващата година")
    func bulgarianPastDateRollsForward() {
        let result = parser(.bulgarian).parse("годишнина 3 март", now: now)
        #expect(result.date == Fixture.date(2027, 3, 3, 9, 0))
    }

    @Test("Час, който вече е минал днес, отива за утре")
    func bulgarianPastHourRollsToTomorrow() {
        let result = parser(.bulgarian).parse("звънни в 8", now: now)  // сега е 9:00
        #expect(result.date == Fixture.date(2026, 8, 11, 8, 0))
    }

    // MARK: - Английски и италиански

    @Test("Английски: „tomorrow at 8:30“")
    func englishTomorrow() {
        let result = parser(.english).parse("pay the bill tomorrow at 8:30", now: now)
        #expect(result.date == Fixture.date(2026, 8, 11, 8, 30))
        // „at“ отпада (част от часа), „the“ остава — то е част от самата задача.
        #expect(result.title == "pay the bill")
    }

    @Test("Английски: „every 2 weeks“")
    func englishEveryTwoWeeks() {
        let result = parser(.english).parse("water plants every 2 weeks", now: now)
        #expect(result.repeatRule == .everyNWeeks)
        #expect(result.interval == 2)
    }

    @Test("Италиански: „domani alle 8“")
    func italianTomorrow() {
        let result = parser(.italian).parse("chiama la mamma domani alle 8", now: now)
        #expect(result.date == Fixture.date(2026, 8, 11, 8, 0))
        #expect(result.title == "chiama la mamma")
    }

    @Test("Италиански: „ogni giorno“ и „tra 3 ore“")
    func italianRepeatAndRelative() {
        #expect(parser(.italian).parse("pastiglie ogni giorno", now: now).repeatRule == .daily)
        #expect(parser(.italian).parse("chiama tra 3 ore", now: now).date == Fixture.date(2026, 8, 10, 12, 0))
    }

    // MARK: - Мълчание, когато не е разбрано

    @Test("Текст без време не измисля дата")
    func noTimeNoDate() {
        let result = parser(.bulgarian).parse("купи хляб", now: now)
        #expect(result.date == nil)
        #expect(result.repeatRule == nil)
        #expect(result.matchedSomething == false)
        #expect(result.title == "купи хляб")
    }

    @Test("Празният текст не чупи нищо")
    func emptyInput() {
        let result = parser(.bulgarian).parse("   ", now: now)
        #expect(result.title.isEmpty)
        #expect(result.date == nil)
    }

    @Test("Числа в заглавието не стават час без предлог")
    func bareNumberStaysInTitle() {
        let result = parser(.bulgarian).parse("купи 6 яйца", now: now)
        #expect(result.date == nil)
        #expect(result.title == "купи 6 яйца")
    }

    @Test("Непознат език пада към английски, а не към кирилица")
    func unknownLanguageFallsBackToEnglish() {
        #expect(ReminderTextParser.Language(code: "de") == .english)
        #expect(ReminderTextParser.Language(code: "bg-BG") == .bulgarian)
        #expect(ReminderTextParser.Language(code: nil) == .english)
    }

    @Test("Броят се ограничава до разумни стойности")
    func intervalIsClamped() {
        let result = parser(.bulgarian).parse("нещо на всеки 999 дни", now: now)
        #expect(result.interval == RepeatRule.intervalRange.upperBound)
    }
}

@Suite("Регресии от одита на парсера")
struct ReminderTextParserAuditTests {
    /// Понеделник, 10 август 2026, 09:00.
    let now = Fixture.date(2026, 8, 10, 9, 0)

    func parser(_ language: ReminderTextParser.Language) -> ReminderTextParser {
        ReminderTextParser(calendar: Fixture.calendar, language: language)
    }

    @Test("„на 15.09“ е дата, не 15:00 — предлогът не я превръща в час")
    func dottedDateAfterPreposition() {
        let result = parser(.bulgarian).parse("такса на 15.09", now: now)
        #expect(result.date == Fixture.date(2026, 9, 15, ReminderDefaults.fallbackHour, 0))
        #expect(result.title == "такса")

        let english = parser(.english).parse("tax on 15.09", now: now)
        #expect(english.date == Fixture.date(2026, 9, 15, ReminderDefaults.fallbackHour, 0))
        #expect(english.title == "tax")
    }

    @Test("„вторник в 8“, написано във вторник вечер → другия вторник, не миналото")
    func weekdayWithPassedHourRollsAWeek() {
        let tuesdayEvening = Fixture.date(2026, 8, 11, 20, 0)
        let result = parser(.bulgarian).parse("плащане на ток вторник в 8", now: tuesdayEvening)
        #expect(result.date == Fixture.date(2026, 8, 18, 8, 0))
        #expect(result.title == "плащане на ток")
    }

    @Test("„в 8 часа“ не оставя „часа“ в заглавието")
    func hourUnitIsConsumed() {
        let result = parser(.bulgarian).parse("среща в 8 часа", now: now)
        #expect(result.title == "среща")
        #expect(result.date == Fixture.date(2026, 8, 11, 8, 0))  // 8 вече мина → утре

        let english = parser(.english).parse("call mom at 8 o'clock", now: now)
        #expect(english.title == "call mom")
    }

    @Test("Абсурден брой след „след“ не измисля година 506713")
    func absurdRelativeCountIsIgnored() {
        let result = parser(.bulgarian).parse("нещо след 9223372036854775807 часа", now: now)
        #expect(result.date == nil)
        #expect(result.title == "нещо след 9223372036854775807 часа")
    }

    @Test("Поставен роман не се парсва на всеки клавиш")
    func hugeInputIsNotParsed() {
        let novel = String(repeating: "утре в 8 ", count: 20_000)
        let started = Date()
        let result = parser(.bulgarian).parse(novel, now: now)
        #expect(Date().timeIntervalSince(started) < 0.05)
        #expect(result.date == nil)
        #expect(result.matchedSomething == false)
    }

    @Test("Предлогът пред „всеки“ остава, когато нищо не е разпознато")
    func prepositionKeptWhenEveryDoesNotMatch() {
        let result = parser(.bulgarian).parse("подарък на всеки от екипа", now: now)
        #expect(result.title == "подарък на всеки от екипа")
        #expect(result.date == nil)
        #expect(result.repeatRule == nil)
        #expect(result.matchedSomething == false)
    }
}
