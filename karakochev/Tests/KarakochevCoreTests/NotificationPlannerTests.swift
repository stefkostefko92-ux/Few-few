import Foundation
import Testing

@testable import KarakochevCore

@Suite("Планиране на известията")
struct NotificationPlannerTests {
    let planner = NotificationPlanner(calendar: Fixture.calendar)
    let now = Fixture.date(2026, 8, 10, 9, 0)  // понеделник

    @Test("Еднократното дава една заявка с точна дата и без повторение")
    func onceProducesExactRequest() {
        let reminder = Fixture.reminder(at: Fixture.date(2026, 8, 12, 8, 30))
        let plan = planner.plan(for: [reminder], now: now)

        #expect(plan.notifications.count == 1)
        let request = plan.notifications[0]
        #expect(request.repeats == false)
        #expect(request.dateComponents.year == 2026)
        #expect(request.dateComponents.month == 8)
        #expect(request.dateComponents.day == 12)
        #expect(request.dateComponents.hour == 8)
        #expect(request.dateComponents.minute == 30)
    }

    @Test("Ежедневното е ЕДНА повтаряща се заявка — работи и ако приложението не се отваря")
    func dailyIsSingleRepeatingRequest() {
        let reminder = Fixture.reminder(at: Fixture.date(2026, 8, 1, 7, 0), repeat: .daily)
        let plan = planner.plan(for: [reminder], now: now)

        #expect(plan.notifications.count == 1)
        #expect(plan.notifications[0].repeats)
        #expect(plan.notifications[0].dateComponents.hour == 7)
        #expect(plan.notifications[0].dateComponents.day == nil)  // без дата → повтаря се
    }

    @Test("„Всеки делник“ дава по една повтаряща се заявка на ден пн–пт")
    func weekdaysProduceFiveRequests() {
        let reminder = Fixture.reminder(at: Fixture.date(2026, 8, 3, 7, 30), repeat: .weekdays)
        let plan = planner.plan(for: [reminder], now: now)

        #expect(plan.notifications.count == 5)
        let allRepeat = plan.notifications.allSatisfy { $0.repeats }
        #expect(allRepeat)
        let weekdays = Set(plan.notifications.compactMap(\.dateComponents.weekday))
        #expect(weekdays == Set(OccurrenceCalculator.weekdayNumbers))
    }

    @Test("Повторение с начало в бъдещето се насрочва поединично, докато започне")
    func futureStartUsesLeadRequests() {
        let reminder = Fixture.reminder(at: Fixture.date(2026, 9, 1, 9, 0), repeat: .daily)
        let plan = planner.plan(for: [reminder], now: now)

        #expect(plan.notifications.count == planner.leadOccurrences)
        let noneRepeat = plan.notifications.allSatisfy { $0.repeats == false }
        #expect(noneRepeat)
        // Първото е точно началната дата — не по-рано.
        #expect(plan.notifications[0].nextFireDate == Fixture.date(2026, 9, 1, 9, 0))
    }

    @Test("Приключените и просрочените не заемат място")
    func doneAndOverdueAreSkipped() {
        let done = Fixture.reminder(at: Fixture.date(2026, 8, 12, 8, 0), isDone: true)
        let overdue = Fixture.reminder(at: Fixture.date(2026, 8, 1, 8, 0))
        #expect(planner.plan(for: [done, overdue], now: now).notifications.isEmpty)
    }

    @Test("Планът е подреден по време — най-близкото известие първо")
    func planIsSortedByFireDate() {
        let late = Fixture.reminder(title: "Късно", at: Fixture.date(2026, 8, 20, 8, 0))
        let soon = Fixture.reminder(title: "Скоро", at: Fixture.date(2026, 8, 11, 8, 0))
        let plan = planner.plan(for: [late, soon], now: now)
        #expect(plan.notifications.map(\.title) == ["Скоро", "Късно"])
    }

    @Test("Бюджетът на iOS се спазва — режат се цели напомняния, най-далечните първи")
    func budgetIsEnforced() {
        let small = NotificationPlanner(calendar: Fixture.calendar, limit: 3)
        let reminders = (1...10).map { index in
            Fixture.reminder(title: "Задача \(index)", at: Fixture.date(2026, 8, 11 + index, 9, 0))
        }
        let plan = small.plan(for: reminders, now: now)

        #expect(plan.notifications.count == 3)
        #expect(plan.skippedReminders == 7)
        #expect(plan.notifications.map(\.title) == ["Задача 1", "Задача 2", "Задача 3"])
    }

    @Test("Половин напомняне не се насрочва — непобралото се получава една резервна заявка")
    func groupsAreNotSplit() {
        let tight = NotificationPlanner(calendar: Fixture.calendar, limit: 4)
        let single = Fixture.reminder(title: "Едно", at: Fixture.date(2026, 8, 11, 8, 0))
        let everyWeekday = Fixture.reminder(title: "Делници", at: Fixture.date(2026, 8, 3, 7, 0), repeat: .weekdays)
        let plan = tight.plan(for: [single, everyWeekday], now: now)

        // „Делници“ не се появява с 2 от 5 дни: или влиза цяло, или получава
        // ЕДНА еднократна заявка за най-близкия си час (по-добре от тишина).
        let weekdayRequests = plan.notifications.filter { $0.title == "Делници" }
        #expect(weekdayRequests.count == 1)
        #expect(weekdayRequests[0].repeats == false)
        #expect(weekdayRequests[0].requestID.hasSuffix("|budget"))
        #expect(plan.reducedReminders == 1)
        #expect(plan.skippedReminders == 0)
        #expect(plan.notifications.contains { $0.title == "Едно" })
    }

    @Test("Лимитът никога не надхвърля твърдия таван на iOS")
    func limitIsClampedToIOSCeiling() {
        let greedy = NotificationPlanner(calendar: Fixture.calendar, limit: 500)
        #expect(greedy.limit == NotificationPlanner.iOSPendingLimit)
    }

    @Test("Идентификаторът на заявката води обратно към записа")
    func requestIDRoundTrip() {
        let id = UUID()
        let requestID = NotificationPlanner.requestID(reminderID: id, suffix: "wd2")
        #expect(NotificationPlanner.reminderID(fromRequestID: requestID) == id)
        #expect(NotificationPlanner.reminderID(fromRequestID: "нещо-друго") == nil)
    }

    @Test("Всяка заявка на едно напомняне има различен идентификатор")
    func requestIDsAreUnique() {
        let reminder = Fixture.reminder(at: Fixture.date(2026, 8, 3, 7, 30), repeat: .weekdays)
        let ids = planner.plan(for: [reminder], now: now).notifications.map(\.requestID)
        #expect(Set(ids).count == ids.count)
    }

    @Test("Празното заглавие получава подаденото резервно (преведено) заглавие")
    func emptyTitleFallsBack() {
        let planner = NotificationPlanner(calendar: Fixture.calendar, fallbackTitle: "Reminder")
        let reminder = Fixture.reminder(title: "   ", at: Fixture.date(2026, 8, 12, 8, 0))
        #expect(planner.plan(for: [reminder], now: now).notifications[0].title == "Reminder")
        #expect(reminder.trimmedTitle == nil)
    }

    @Test("Напомняне без нито едно бъдещо задействане не произвежда известия")
    func reminderWithoutOccurrenceYieldsNoNotifications() {
        // Еднократно, чийто час е минал, без отлагане — легитимно състояние
        // (просрочено), не грешка; планът просто не му отделя място.
        let overdueOnce = Fixture.reminder(at: Fixture.date(2026, 8, 1, 8, 0))
        #expect(planner.plan(for: [overdueOnce], now: now).notifications.isEmpty)
    }

    // MARK: - Бюджет на границата (по подразбиране 56)

    @Test("Точно 56 напомняния се побират без нито едно пропуснато")
    func budgetBoundaryExactlyFits() {
        let reminders = (1...56).map { index in
            Fixture.reminder(title: "Задача \(index)", at: Fixture.date(2026, 8, 11, 0, min(index, 59)))
        }
        let plan = planner.plan(for: reminders, now: now)
        #expect(plan.notifications.count == 56)
        #expect(plan.skippedReminders == 0)
    }

    @Test("57-ото напомняне вече не се побира в бюджета от 56")
    func budgetBoundaryOverflowsByOne() {
        let reminders = (1...57).map { index in
            Fixture.reminder(title: "Задача \(index)", at: Fixture.date(2026, 8, 11, 0, min(index, 59)))
        }
        let plan = planner.plan(for: reminders, now: now)
        #expect(plan.notifications.count == 56)
        #expect(plan.skippedReminders == 1)
    }

    @Test("Няколко напомняния в един и същ час всички влизат в плана")
    func multipleRemindersAtSameHour() {
        let a = Fixture.reminder(title: "Лекарство", at: Fixture.date(2026, 8, 11, 9, 0))
        let b = Fixture.reminder(title: "Обаждане", at: Fixture.date(2026, 8, 11, 9, 0))
        let plan = planner.plan(for: [a, b], now: now)
        // Асертираме кои са включени, не строгия ред между тях — редът между
        // равни по време напомняния не е гарантирано поведение.
        #expect(Set(plan.notifications.map(\.title)) == ["Лекарство", "Обаждане"])
        #expect(plan.notifications.allSatisfy { $0.nextFireDate == Fixture.date(2026, 8, 11, 9, 0) })
    }

    // MARK: - Регресия по находка от ревюто

    @Test("Отлагането е добавъчна заявка — не изяжда стъпало от поединичните заявки")
    func snoozeDuplicatesLeadOccurrenceForFutureRepeating() {
        var reminder = Fixture.reminder(at: Fixture.date(2026, 9, 1, 9, 0), repeat: .daily)
        reminder.snoozedUntil = Fixture.date(2026, 8, 15, 9, 0)
        let plan = planner.plan(for: [reminder], now: now)

        // Очакваното поведение: отлагането е ЕДНА добавъчна заявка, а `lead`
        // сериите пазят `leadOccurrences` чисти стъпки по шаблона (1, 2 септември...),
        // без да пропускат/дублират стъпало заради отлагането.
        let leadDates = plan.notifications.filter { $0.requestID.contains("|lead") }.map(\.nextFireDate)
        #expect(
            leadDates == [
                Fixture.date(2026, 9, 1, 9, 0),
                Fixture.date(2026, 9, 2, 9, 0),
                Fixture.date(2026, 9, 3, 9, 0),
                Fixture.date(2026, 9, 4, 9, 0),
            ])
        let uniqueFireDates = Set(plan.notifications.map(\.nextFireDate))
        #expect(uniqueFireDates.count == plan.notifications.count)  // без дублирано задействане
    }
}
