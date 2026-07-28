import Foundation
import Observation
import SwiftData
import UserNotifications

/// Държи насрочените известия в синхрон с базата.
///
/// Единствената точка, която пипа `UNUserNotificationCenter` заедно с базата.
/// Пресинхронизира се при старт, при връщане на приложението на преден план и
/// след всяка промяна по напомнянията.
@MainActor
@Observable
final class ReminderScheduler {
    private let context: ModelContext
    private let service: NotificationService
    private let planner: NotificationPlanner
    /// Базата не се отвори и работим върху временна (в паметта) — виж `NezabravkaApp`.
    let isTemporaryStore: Bool

    private(set) var authorizationStatus: UNAuthorizationStatus = .notDetermined
    /// Колко напомняния не се побраха в лимита на iOS (виж `NotificationPlanner`).
    private(set) var skippedReminders = 0
    /// Колко напомняния са сведени до едно известие заради лимита на iOS.
    private(set) var reducedReminders = 0
    private(set) var scheduledCount = 0
    /// Записът, отворен от натиснато известие — списъкът го подчертава.
    var highlightedReminderID: UUID?
    /// Последният неуспешен запис — показва се в списъка, не се преглъща.
    private(set) var saveError: String?

    /// Веригата от пресинхронизации (виж `resync()`).
    private var resyncTask: Task<Void, Never>?

    init(
        context: ModelContext,
        service: NotificationService = .shared,
        planner: NotificationPlanner = NotificationPlanner(),
        isTemporaryStore: Bool = false
    ) {
        self.context = context
        self.service = service
        self.planner = planner
        self.isTemporaryStore = isTemporaryStore
        service.start()
        service.onAction = { [weak self] action in
            await self?.handle(action)
        }
    }

    var isAuthorized: Bool {
        authorizationStatus == .authorized || authorizationStatus == .provisional
    }

    /// Разрешението е поискано и отказано — известия няма да има, докато
    /// потребителят не го включи от Настройки.
    var isDenied: Bool { authorizationStatus == .denied }

    // MARK: - Разрешение

    func requestAuthorizationIfNeeded() async {
        authorizationStatus = await service.authorizationStatus()
        if authorizationStatus == .notDetermined {
            authorizationStatus = await service.requestAuthorization()
        }
        await resync()
    }

    // MARK: - Синхронизация

    func refresh() async {
        authorizationStatus = await service.authorizationStatus()
        await resync()
    }

    /// Пресинхронизира плана — сериализирано.
    ///
    /// `@MainActor async` НЕ е взаимно изключващо: всяко `await` вътре пуска
    /// друга задача да влезе в същия метод. Два преплетени пресинхрона са
    /// опасни, защото `apply` първо трие всички чакащи известия, а после ги
    /// добавя едно по едно — по-старият план би дописал заявки върху по-новия
    /// (призрачно известие за изтрит запис) или обратно. Затова всеки
    /// пресинхрон изчаква предишния.
    func resync() async {
        let previous = resyncTask
        let task = Task { @MainActor [weak self] in
            await previous?.value
            await self?.performResync()
        }
        resyncTask = task
        await task.value
    }

    private func performResync() async {
        // Временна база = не знаем какво има на диска. Стоим настрана от
        // насрочените известия, вместо да ги изтрием заради празен списък.
        guard !isTemporaryStore else { return }

        let now = Date()
        guard let reminders = fetchAll() else {
            // Базата не се прочете. По-добре старият план да остане, отколкото
            // да изтрием всички известия заради празен резултат.
            return
        }

        // Изгорелите отлагания се чистят, преди да планираме — иначе биха
        // изглеждали като „следващо задействане“ завинаги.
        var changed = false
        for reminder in reminders {
            if reminder.clearExpiredSnooze(now: now) { changed = true }
        }
        if changed { save() }

        guard isAuthorized else {
            skippedReminders = 0
            scheduledCount = 0
            return
        }

        let plan = planner.plan(for: reminders.map(\.snapshot), now: now)
        // Броим реално насрочените, не планираните — иначе етикетът в списъка
        // обещава известия, които системата може да е отказала.
        scheduledCount = await service.apply(plan)
        skippedReminders = plan.skippedReminders
        reducedReminders = plan.reducedReminders
    }

    // MARK: - Промени по напомнянията

    func add(_ reminder: Reminder) {
        context.insert(reminder)
        saveAndResync()
    }

    func delete(_ reminder: Reminder) {
        clearHighlight(reminder.id)
        context.delete(reminder)
        saveAndResync()
    }

    func toggleDone(_ reminder: Reminder) {
        clearHighlight(reminder.id)
        if reminder.isDone {
            reminder.markNotDone()
        } else {
            reminder.markDone()
        }
        saveAndResync()
    }

    func snooze(_ reminder: Reminder, option: SnoozeOption) {
        guard let date = option.nextDate(from: Date()) else { return }
        clearHighlight(reminder.id)
        reminder.snooze(until: date)
        saveAndResync()
    }

    /// Извиква се след редакция през `ReminderEditorView`.
    func commitEdit(_ reminder: Reminder? = nil) {
        if let reminder { clearHighlight(reminder.id) }
        saveAndResync()
    }

    func clearDeliveredNotifications() {
        service.clearDelivered()
    }

    func dismissSaveError() {
        saveError = nil
    }

    // MARK: - Действия от известието

    /// `async` нарочно — изчаква се докрай от делегата на известията, докато
    /// iOS още държи приложението будно (виж `NotificationService.onAction`).
    private func handle(_ action: NotificationAction) async {
        switch action {
        case .open(let id):
            highlightedReminderID = id

        case .complete(let id):
            guard let reminder = reminder(with: id) else { return }
            // От известието „Готово“ значи „това задействане е свършено“.
            // Повтарящото се напомняне НЕ се архивира — иначе едно натискане
            // би убило цялата поредица („всеки ден в 7:00“) без предупреждение.
            if reminder.repeatRule.isRepeating {
                reminder.snoozedUntil = nil
                reminder.completedAt = Date()
            } else {
                reminder.markDone()
            }
            save()
            await resync()

        case .snooze(let id, let option):
            guard let reminder = reminder(with: id), let date = option.nextDate(from: Date()) else { return }
            reminder.snooze(until: date)
            save()
            await resync()
        }
    }

    // MARK: - База

    private func saveAndResync() {
        // Един шев за всяка мутация: инвариантът „изтрито/променено напомняне
        // не оставя призрачно известие“ се пази от кода, не от дисциплина.
        save()
        Task { await resync() }
    }

    /// `nil` = четенето се провали (различно от „няма записи“).
    private func fetchAll() -> [Reminder]? {
        let descriptor = FetchDescriptor<Reminder>(sortBy: [SortDescriptor(\.fireDate)])
        do {
            return try context.fetch(descriptor)
        } catch {
            print("[Незабравка] базата не се прочете: \(error.localizedDescription)")
            return nil
        }
    }

    private func reminder(with id: UUID) -> Reminder? {
        fetchAll()?.first { $0.id == id }
    }

    private func clearHighlight(_ id: UUID) {
        if highlightedReminderID == id { highlightedReminderID = nil }
    }

    private func save() {
        do {
            try context.save()
            saveError = nil
        } catch {
            // Мълчаливият провал е най-лошият изход: списъкът показва записа
            // като запазен, планът се строи от незаписано състояние, а при
            // следващия старт записката липсва. Връщаме контекста назад и
            // казваме на потребителя.
            context.rollback()
            saveError = "Промяната не се запази. Опитай отново."
            print("[Незабравка] записът в базата не мина: \(error.localizedDescription)")
        }
    }
}
