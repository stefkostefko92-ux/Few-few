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

    @Test("Името на файла носи датата")
    func fileNameCarriesDate() {
        #expect(ReminderArchiveCoder.fileName(for: now, calendar: Fixture.calendar) == "karakochev-2026-08-10.json")
    }
}
