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

    private(set) var authorizationStatus: UNAuthorizationStatus = .notDetermined
    /// Колко напомняния не се побраха в лимита на iOS (виж `NotificationPlanner`).
    private(set) var skippedReminders = 0
    private(set) var scheduledCount = 0
    /// Записът, отворен от натиснато известие — списъкът го подчертава.
    var highlightedReminderID: UUID?

    init(
        context: ModelContext,
        service: NotificationService = .shared,
        planner: NotificationPlanner = NotificationPlanner()
    ) {
        self.context = context
        self.service = service
        self.planner = planner
        service.start()
        service.onAction = { [weak self] action in
            self?.handle(action)
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

    func resync() async {
        let now = Date()
        let reminders = fetchAll()

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
        await service.apply(plan)
        skippedReminders = plan.skippedReminders
        scheduledCount = plan.notifications.count
    }

    // MARK: - Промени по напомнянията

    func add(_ reminder: Reminder) {
        context.insert(reminder)
        save()
        Task { await resync() }
    }

    func delete(_ reminder: Reminder) {
        context.delete(reminder)
        save()
        Task { await resync() }
    }

    func toggleDone(_ reminder: Reminder) {
        if reminder.isDone {
            reminder.markNotDone()
        } else {
            reminder.markDone()
        }
        save()
        Task { await resync() }
    }

    func snooze(_ reminder: Reminder, option: SnoozeOption) {
        guard let date = option.nextDate(from: Date()) else { return }
        reminder.snooze(until: date)
        save()
        Task { await resync() }
    }

    /// Извиква се след редакция през `ReminderEditorView`.
    func commitEdit() {
        save()
        Task { await resync() }
    }

    func clearDeliveredNotifications() {
        service.clearDelivered()
    }

    // MARK: - Действия от известието

    private func handle(_ action: NotificationAction) {
        switch action {
        case .open(let id):
            highlightedReminderID = id
        case .complete(let id):
            guard let reminder = reminder(with: id) else { return }
            reminder.markDone()
            save()
            Task { await resync() }
        case .snooze(let id, let option):
            guard let reminder = reminder(with: id), let date = option.nextDate(from: Date()) else { return }
            reminder.snooze(until: date)
            save()
            Task { await resync() }
        }
    }

    // MARK: - База

    private func fetchAll() -> [Reminder] {
        let descriptor = FetchDescriptor<Reminder>(sortBy: [SortDescriptor(\.fireDate)])
        return (try? context.fetch(descriptor)) ?? []
    }

    private func reminder(with id: UUID) -> Reminder? {
        fetchAll().first { $0.id == id }
    }

    private func save() {
        do {
            try context.save()
        } catch {
            print("[Незабравка] записът в базата не мина: \(error.localizedDescription)")
        }
    }
}
