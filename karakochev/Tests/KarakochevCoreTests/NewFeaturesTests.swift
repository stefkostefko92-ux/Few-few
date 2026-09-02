import Foundation
import Testing

@testable import KarakochevCore

@Suite("Повторения на интервал и последен работен ден")
struct IntervalRepeatTests {
    let calculator = OccurrenceCalculator(calendar: Fixture.calendar)
    let planner = NotificationPlanner(calendar: Fixture.calendar)
    let now = Fixture.date(2026, 8, 10, 9, 0)

    @Test("„На всеки 3 дни“ брои от началото, не от „сега“")
    func everyThreeDaysCountsFromStart() {
        var reminder = Fixture.reminder(at: Fixture.date(2026, 8, 1, 7, 0), repeat: .everyNDays)
        reminder.interval = 3
        // 1, 4, 7, 10, 13 август… в 07:00. „Сега“ е 10 август 09:00 → следващото е 13-и.
        #expect(calculator.nextOccurrence(of: reminder, after: now) == Fixture.date(2026, 8, 13, 7, 0))
    }

    @Test("Стъпката не се разминава при многократно смятане")
    func everyNDaysSeriesIsStable() {
        var reminder = Fixture.reminder(at: Fixture.date(2026, 8, 1, 7, 0), repeat: .everyNDays)
        reminder.interval = 5
        let series = calculator.patternOccurrences(of: reminder, after: now, limit: 3)
        #expect(
            series == [
                Fixture.date(2026, 8, 11, 7, 0),
                Fixture.date(2026, 8, 16, 7, 0),
                Fixture.date(2026, 8, 21, 7, 0),
            ])
    }

    @Test("„На всеки 2 седмици“ пази деня от седмицата")
    func everyTwoWeeksKeepsWeekday() {
        var reminder = Fixture.reminder(at: Fixture.date(2026, 8, 4, 18, 0), repeat: .everyNWeeks)  // вторник
        reminder.interval = 2
        let next = calculator.nextOccurrence(of: reminder, after: now)
        #expect(next == Fixture.date(2026, 8, 18, 18, 0))
        #expect(Fixture.parts(next!).weekday == 3)
    }

    @Test("Нулев или огромен интервал се ограничава — без безкраен цикъл")
    func intervalIsClamped() {
        var reminder = Fixture.reminder(at: Fixture.date(2026, 8, 1, 7, 0), repeat: .everyNDays)
        reminder.interval = 0
        #expect(reminder.interval == 1)  // сетърът минава през clamp в init-а
        let snapshot = ReminderSnapshot(
            id: UUID(), title: "x", fireDate: Fixture.date(2026, 8, 1, 7, 0),
            repeatRule: .everyNDays, interval: 0
        )
        #expect(calculator.nextOccurrence(of: snapshot, after: now) == Fixture.date(2026, 8, 11, 7, 0))
    }

    @Test("Последният работен ден от август 2026 е 31-ви (понеделник)")
    func lastWorkdayOfAugust() {
        let reminder = Fixture.reminder(at: Fixture.date(2026, 8, 1, 10, 0), repeat: .lastWorkdayOfMonth)
        #expect(calculator.nextOccurrence(of: reminder, after: now) == Fixture.date(2026, 8, 31, 10, 0))
    }

    @Test("Когато месецът свършва в събота/неделя, се връща назад до петък")
    func lastWorkdaySkipsWeekend() {
        // 31 май 2026 е неделя, 30 май е събота → последният работен ден е 29 май (петък).
        let reminder = Fixture.reminder(at: Fixture.date(2026, 5, 1, 10, 0), repeat: .lastWorkdayOfMonth)
        let next = calculator.nextOccurrence(of: reminder, after: Fixture.date(2026, 5, 15, 9, 0))
        #expect(next == Fixture.date(2026, 5, 29, 10, 0))
    }

    @Test("Щом последният работен ден е минал, отива в следващия месец")
    func lastWorkdayRollsToNextMonth() {
        let reminder = Fixture.reminder(at: Fixture.date(2026, 8, 1, 10, 0), repeat: .lastWorkdayOfMonth)
        let next = calculator.nextOccurrence(of: reminder, after: Fixture.date(2026, 8, 31, 11, 0))
        #expect(next == Fixture.date(2026, 9, 30, 10, 0))  // 30 септември е сряда
    }

    @Test("Начало отпреди 12 години не мълчи и не струва хиляди стъпки")
    func ancientStartIsArithmetic() {
        // Червеният екип: цикълът с таван 4 000 стъпки правеше запис на ≥3 999
        // дни да изчезне от „Предстоящи“ и струваше секунди на всяко смятане.
        var days = Fixture.reminder(at: Fixture.date(2014, 8, 1, 7, 0), repeat: .everyNDays)
        days.interval = 3
        let started = Date()
        let next = calculator.nextOccurrence(of: days, after: now)
        let elapsed = Date().timeIntervalSince(started)
        let unwrapped = try? #require(next)
        #expect(unwrapped != nil)
        if let unwrapped {
            #expect(unwrapped > now)
            #expect(unwrapped <= Fixture.date(2026, 8, 13, 7, 0))
            let span = Fixture.calendar.dateComponents([.day], from: days.fireDate, to: unwrapped).day ?? -1
            #expect(span % 3 == 0)
            #expect(Fixture.parts(unwrapped).hour == 7)
        }
        #expect(elapsed < 0.05, "\(elapsed) s за едно смятане")

        var weeks = Fixture.reminder(at: Fixture.date(2014, 8, 5, 18, 0), repeat: .everyNWeeks)  // вторник
        weeks.interval = 2
        let nextWeek = calculator.nextOccurrence(of: weeks, after: now)
        #expect(nextWeek == Fixture.date(2026, 8, 18, 18, 0))
    }

    @Test("Аритметичната стъпка съвпада с броенето едно по едно")
    func arithmeticStepMatchesCounting() {
        var reminder = Fixture.reminder(at: Fixture.date(2026, 3, 27, 7, 0), repeat: .everyNDays)  // през лятното време
        reminder.interval = 4
        var expected = reminder.fireDate
        while expected <= now {
            expected = Fixture.calendar.date(byAdding: .day, value: 4, to: expected)!
        }
        #expect(calculator.nextOccurrence(of: reminder, after: now) == expected)
        #expect(Fixture.parts(expected).hour == 7)
    }

    @Test("„Последният работен ден“ с начало в бъдещето не звъни на началната дата")
    func lastWorkdayWithFutureStartSkipsToPattern() {
        // Редакторът предлага „след час“ като начало — почти винаги произволен ден.
        let reminder = Fixture.reminder(at: Fixture.date(2026, 8, 20, 10, 0), repeat: .lastWorkdayOfMonth)
        #expect(calculator.nextOccurrence(of: reminder, after: now) == Fixture.date(2026, 8, 31, 10, 0))

        // Начало точно на последния работен ден си остава валидно първо задействане.
        let onTheDay = Fixture.reminder(at: Fixture.date(2026, 8, 31, 10, 0), repeat: .lastWorkdayOfMonth)
        #expect(calculator.nextOccurrence(of: onTheDay, after: now) == Fixture.date(2026, 8, 31, 10, 0))
    }

    @Test("Правилата без нативен тригер се насрочват като поредица от заявки")
    func rulesWithoutNativeTriggerUseSeries() {
        var reminder = Fixture.reminder(at: Fixture.date(2026, 8, 1, 7, 0), repeat: .everyNDays)
        reminder.interval = 3
        let plan = planner.plan(for: [reminder], now: now)

        #expect(plan.notifications.count == planner.seriesOccurrences)
        let noneRepeat = plan.notifications.allSatisfy { $0.repeats == false }
        #expect(noneRepeat)
        // Всяка заявка носи точна дата и часова зона.
        let allExact = plan.notifications.allSatisfy {
            $0.dateComponents.day != nil && $0.dateComponents.timeZone != nil
        }
        #expect(allExact)
    }

    @Test("Правилата с нативен тригер си остават една повтаряща се заявка")
    func nativeRulesStayCheap() {
        #expect(RepeatRule.daily.hasNativeTrigger)
        #expect(RepeatRule.everyNDays.hasNativeTrigger == false)
        #expect(RepeatRule.lastWorkdayOfMonth.hasNativeTrigger == false)

        let reminder = Fixture.reminder(at: Fixture.date(2026, 8, 1, 7, 0), repeat: .daily)
        #expect(planner.plan(for: [reminder], now: now).notifications.count == 1)
    }
}

@Suite("Настойчиви известия за важните")
struct NudgeTests {
    let planner = NotificationPlanner(calendar: Fixture.calendar)
    let now = Fixture.date(2026, 8, 10, 9, 0)

    @Test("Важното напомняне пита пак, ако не е потвърдено")
    func importantReminderGetsNudges() {
        let reminder = Fixture.reminder(at: Fixture.date(2026, 8, 10, 20, 0), isImportant: true)
        let plan = planner.plan(for: [reminder], now: now)

        #expect(plan.notifications.count == 1 + planner.nudgeOffsets.count)
        let nudges = plan.notifications.filter { $0.requestID.contains("|nudge") }
        #expect(
            nudges.map(\.nextFireDate) == [
                Fixture.date(2026, 8, 10, 20, 10),
                Fixture.date(2026, 8, 10, 20, 25),
            ])
    }

    @Test("Обикновеното напомняне остава едно известие")
    func normalReminderHasNoNudges() {
        let reminder = Fixture.reminder(at: Fixture.date(2026, 8, 10, 20, 0))
        #expect(planner.plan(for: [reminder], now: now).notifications.count == 1)
    }

    @Test("Повтарящото се важно напомняне също получава настойчивост")
    func repeatingImportantGetsNudges() {
        let reminder = Fixture.reminder(at: Fixture.date(2026, 8, 1, 20, 0), repeat: .daily, isImportant: true)
        let plan = planner.plan(for: [reminder], now: now)

        #expect(plan.notifications.filter(\.repeats).count == 1)
        #expect(plan.notifications.filter { $0.requestID.contains("|nudge") }.count == 2)
    }

    @Test("Настойчивостта се изключва с празен списък отмествания")
    func nudgesCanBeDisabled() {
        let quiet = NotificationPlanner(calendar: Fixture.calendar, nudgeOffsets: [])
        let reminder = Fixture.reminder(at: Fixture.date(2026, 8, 10, 20, 0), isImportant: true)
        #expect(quiet.plan(for: [reminder], now: now).notifications.count == 1)
    }

    @Test("Настойчивите заявки също носят часова зона")
    func nudgesCarryTimeZone() {
        let reminder = Fixture.reminder(at: Fixture.date(2026, 8, 10, 20, 0), isImportant: true)
        let plan = planner.plan(for: [reminder], now: now)
        let allZoned = plan.notifications.allSatisfy { $0.dateComponents.timeZone != nil }
        #expect(allZoned)
    }

    @Test("Отложеното важно напомняне пази настойчивостта си")
    func snoozedImportantKeepsNudges() {
        // Одит: отлагането беше една гола заявка — „След 10 минути“ превръщаше
        // важното в обикновено точно когато човекът веднъж вече не е реагирал.
        var reminder = Fixture.reminder(at: Fixture.date(2026, 8, 10, 20, 0), isImportant: true)
        reminder.snoozedUntil = Fixture.date(2026, 8, 10, 10, 30)
        let plan = planner.plan(for: [reminder], now: now)
        let dates = Set(plan.notifications.map(\.nextFireDate))

        #expect(dates.contains(Fixture.date(2026, 8, 10, 10, 30)))
        #expect(dates.contains(Fixture.date(2026, 8, 10, 10, 40)))
        #expect(dates.contains(Fixture.date(2026, 8, 10, 10, 55)))
        // Основното задействане със своята настойчивост остава непокътнато.
        #expect(dates.contains(Fixture.date(2026, 8, 10, 20, 25)))
        #expect(plan.notifications.count == 6)
        #expect(Set(plan.notifications.map(\.requestID)).count == 6)
    }

    @Test("Просроченото важно напомняне, отложено „за после“, пак пита повторно")
    func overdueSnoozedImportantNudges() {
        var reminder = Fixture.reminder(at: Fixture.date(2026, 8, 9, 20, 0), isImportant: true)
        reminder.snoozedUntil = Fixture.date(2026, 8, 10, 9, 10)
        let plan = planner.plan(for: [reminder], now: now)

        #expect(plan.notifications.count == 3)
        #expect(plan.notifications.map(\.nextFireDate).max() == Fixture.date(2026, 8, 10, 9, 35))
    }
}

@Suite("Планът при хиляди записи")
struct LargePlanTests {
    let planner = NotificationPlanner(calendar: Fixture.calendar)
    let now = Fixture.date(2026, 8, 10, 9, 0)

    @Test("Над бюджета се брои, без да се строят заявки за всеки запис")
    func thousandsAreCountedNotBuilt() {
        // Червеният екип: 10 000 внесени записа без таван струваха минути на
        // всеки пресинхрон, защото планът строеше поредици за всички, а после
        // изхвърляше всичко след 56-ото. Тук 3 000 правила без нативен тригер —
        // най-скъпият вид — трябва да минат за части от секундата.
        let reminders = (0..<3000).map { index in
            var reminder = Fixture.reminder(
                title: "Запис \(index)",
                at: Fixture.date(2026, 8, 1, 7, 0),
                repeat: .everyNDays,
                isImportant: index % 2 == 0
            )
            reminder.interval = 1 + index % 30
            return reminder
        }
        let started = Date()
        let plan = planner.plan(for: reminders, now: now)
        let elapsed = Date().timeIntervalSince(started)

        let planned = Set(plan.notifications.map(\.reminderID)).count
        #expect(plan.notifications.count <= planner.limit)
        // Всеки запис е или в плана (цял или сведен), или преброен като пропуснат.
        #expect(plan.skippedReminders == reminders.count - planned)
        #expect(elapsed < 5, "планът за 3 000 записа отне \(elapsed) s")
    }
}

@Suite("Износ и внос на записките")
struct ArchiveTests {
    let now = Fixture.date(2026, 8, 10, 9, 0)

    @Test("Изнесеното се внася обратно без загуба")
    func roundTrip() throws {
        var snoozed = Fixture.reminder(title: "Обаждане", at: Fixture.date(2026, 8, 12, 8, 0), isImportant: true)
        snoozed.snoozedUntil = Fixture.date(2026, 8, 11, 10, 0)
        var interval = Fixture.reminder(title: "Цветята", at: Fixture.date(2026, 8, 1, 7, 0), repeat: .everyNDays)
        interval.interval = 3
        let original = [snoozed, interval, Fixture.reminder(title: "Готово", at: now, isDone: true)]

        let data = try ReminderArchiveCoder.encode(original, exportedAt: now)
        let restored = try ReminderArchiveCoder.decode(data)

        #expect(restored == original)
    }

    @Test("Повреден файл дава ясна грешка, не срив")
    func brokenFileFails() {
        #expect(throws: ReminderArchiveCoder.ImportError.unreadable) {
            try ReminderArchiveCoder.decode(Data("не съм архив".utf8))
        }
    }

    @Test("Архив от по-нова версия се отказва честно")
    func futureVersionIsRejected() throws {
        let json = #"{"version":99,"exportedAt":"2026-08-10T06:00:00Z","reminders":[]}"#
        #expect(throws: ReminderArchiveCoder.ImportError.tooNew(version: 99)) {
            try ReminderArchiveCoder.decode(Data(json.utf8))
        }
    }

    @Test("Версия 0 или отрицателна не е наш архив")
    func nonPositiveVersionIsRejected() {
        for version in [0, -1] {
            let json = #"{"version":\#(version),"exportedAt":"2026-08-10T06:00:00Z","reminders":[]}"#
            #expect(throws: ReminderArchiveCoder.ImportError.unreadable) {
                try ReminderArchiveCoder.decode(Data(json.utf8))
            }
        }
    }

    @Test("Непознато правило не изхвърля записа — става еднократно")
    func unknownRuleDegradesGracefully() throws {
        let json = """
            {"version":1,"exportedAt":"2026-08-10T06:00:00Z","reminders":[
              {"id":"\(UUID().uuidString)","title":"От бъдещето","note":"","fireDate":"2026-08-12T05:30:00Z",
               "repeatRule":"everySecondFullMoon","interval":1,"isDone":false,"isImportant":false}
            ]}
            """
        let restored = try ReminderArchiveCoder.decode(Data(json.utf8))
        #expect(restored.count == 1)
        #expect(restored[0].repeatRule == .once)
    }

    @Test("Внасянето само добавя — не трие и не дублира")
    func importOnlyAdds() {
        let existing = [Fixture.reminder(title: "Стара", at: now)]
        let imported = existing + [Fixture.reminder(title: "Нова", at: now)]
        let fresh = ReminderArchiveCoder.newReminders(from: imported, existing: existing)

        #expect(fresh.count == 1)
        #expect(fresh[0].title == "Нова")
    }

    @Test("Двойник вътре в самия файл се внася веднъж")
    func duplicateIDsInsideArchiveCollapse() {
        let id = UUID()
        let imported = [
            Fixture.reminder(title: "Първа", at: now, id: id),
            Fixture.reminder(title: "Пак същата", at: now, id: id),
        ]
        let fresh = ReminderArchiveCoder.newReminders(from: imported, existing: [])
        #expect(fresh.count == 1)
        #expect(fresh[0].title == "Първа")
    }

    @Test("Архив над тавана се отказва, преди да натовари базата")
    func oversizedArchiveIsRejected() throws {
        // Червеният екип: без таван 10 000 записа се внасят „успешно“ и после
        // всеки пресинхрон става минути. Тук границата е по брой записи…
        let many = (0...ReminderArchiveCoder.maxReminders).map { _ in Fixture.reminder(at: now) }
        let data = try ReminderArchiveCoder.encode(many, exportedAt: now)
        #expect(throws: ReminderArchiveCoder.ImportError.tooLarge) {
            try ReminderArchiveCoder.decode(data)
        }
        // …и по байтове — файл над тавана изобщо не се парсва.
        let blob = Data(repeating: UInt8(ascii: " "), count: ReminderArchiveCoder.maxBytes + 1)
        #expect(throws: ReminderArchiveCoder.ImportError.tooLarge) {
            try ReminderArchiveCoder.decode(blob)
        }
    }

    @Test("Пълен архив на тавана минава — границата не реже реален бекъп")
    func archiveAtTheCapIsAccepted() throws {
        let atCap = (0..<ReminderArchiveCoder.maxReminders).map { _ in Fixture.reminder(at: now) }
        let data = try ReminderArchiveCoder.encode(atCap, exportedAt: now)
        #expect(data.count <= ReminderArchiveCoder.maxBytes)
        #expect(try ReminderArchiveCoder.decode(data).count == ReminderArchiveCoder.maxReminders)
    }

    @Test("Името на файла носи датата")
    func fileNameCarriesDate() {
        #expect(ReminderArchiveCoder.fileName(for: now, calendar: Fixture.calendar) == "karakochev-2026-08-10.json")
    }
}
