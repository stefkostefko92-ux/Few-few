import Foundation
import UserNotifications

/// Какво е поискал потребителят от самото известие.
enum NotificationAction: Sendable {
    case open(UUID)
    case complete(UUID)
    case snooze(UUID, SnoozeOption)
}

/// Идентификаторите на категорията и действията.
///
/// Стоят **извън** `NotificationService`, защото той е `@MainActor`, а
/// делегатът на iOS ги чете от `nonisolated` контекст — статичен член на
/// изолиран клас не се вижда оттам (грешка в Swift 6, предупреждение в Swift 5).
enum NotificationIdentifiers {
    static let category = "KARAKOCHEV_REMINDER"
    static let complete = "COMPLETE"
    private static let snoozePrefix = "SNOOZE_"

    static func snooze(for option: SnoozeOption) -> String {
        snoozePrefix + option.rawValue
    }

    static func snoozeOption(from identifier: String) -> SnoozeOption? {
        guard identifier.hasPrefix(snoozePrefix) else { return nil }
        return SnoozeOption(rawValue: String(identifier.dropFirst(snoozePrefix.count)))
    }
}

/// Тънка обвивка над `UNUserNotificationCenter`.
///
/// Тук няма достъп до базата — какво да се промени по записа решава
/// `ReminderScheduler` (през `onAction`). Известията са **локални**: нищо не
/// излиза от устройството, няма сървър и няма APNs.
@MainActor
final class NotificationService: NSObject, UNUserNotificationCenterDelegate {
    static let shared = NotificationService()

    private let center = UNUserNotificationCenter.current()

    /// Викащият поема действията от известието.
    ///
    /// Нарочно е `async`: iOS дава на приложението изпълнение само докато
    /// делегатският метод `didReceive` тече. Ако обработката се пусне в
    /// откачен `Task`, системата може да приспи процеса, преди планът да е
    /// пресинхронизиран — и „Готово“/„Отложи“ от известието остава наполовина.
    var onAction: ((NotificationAction) async -> Void)?

    /// Извиква се веднъж при старт — преди системата да е доставила отговор на известие.
    func start() {
        center.delegate = self
        registerCategories()
    }

    private func registerCategories() {
        var actions: [UNNotificationAction] = SnoozeOption.notificationActions.map { option in
            UNNotificationAction(
                identifier: NotificationIdentifiers.snooze(for: option),
                title: option.localizedTitle,
                options: []
            )
        }
        actions.append(
            UNNotificationAction(
                identifier: NotificationIdentifiers.complete,
                title: String(localized: "action.done"),
                options: []
            )
        )
        let category = UNNotificationCategory(
            identifier: NotificationIdentifiers.category,
            actions: actions,
            intentIdentifiers: [],
            options: []
        )
        center.setNotificationCategories([category])
    }

    // MARK: - Разрешение

    func authorizationStatus() async -> UNAuthorizationStatus {
        await center.notificationSettings().authorizationStatus
    }

    /// Пита за разрешение (само първия път — след това iOS връща наличния отговор).
    @discardableResult
    func requestAuthorization() async -> UNAuthorizationStatus {
        _ = try? await center.requestAuthorization(options: [.alert, .sound, .badge])
        return await authorizationStatus()
    }

    // MARK: - Насрочване

    /// Привежда чакащите известия към новия план и връща колко реално са насрочени.
    ///
    /// Разлика, а не „изтрий всичко и добави наново“: при пълна подмяна между
    /// триенето и добавянето има прозорец (до 56 обиколки към системата), в който
    /// смърт на процеса оставя телефона без нито едно известие. Заявка със същия
    /// идентификатор се презаписва, затова е достатъчно да махнем само излишните.
    @discardableResult
    func apply(_ plan: NotificationPlanner.Plan) async -> Int {
        let wanted = Set(plan.notifications.map(\.requestID))
        let pending = await center.pendingNotificationRequests().map(\.identifier)
        let stale = pending.filter { !wanted.contains($0) }
        if !stale.isEmpty {
            center.removePendingNotificationRequests(withIdentifiers: stale)
        }

        var scheduled = 0
        for planned in plan.notifications {
            let content = UNMutableNotificationContent()
            content.title = planned.title
            if !planned.body.isEmpty { content.body = planned.body }
            content.sound = .default
            content.categoryIdentifier = NotificationIdentifiers.category
            content.userInfo = ["reminderID": planned.reminderID.uuidString]
            // „Важно“ пробива режим „Фокус“ само ако проектът има способността
            // Time Sensitive Notifications; без нея iOS го третира като обикновено.
            content.interruptionLevel = planned.isImportant ? .timeSensitive : .active

            let trigger = UNCalendarNotificationTrigger(
                dateMatching: planned.dateComponents,
                repeats: planned.repeats
            )
            let request = UNNotificationRequest(
                identifier: planned.requestID,
                content: content,
                trigger: trigger
            )
            do {
                try await center.add(request)
                scheduled += 1
            } catch {
                // Единичен неуспех не бива да събаря останалия план — но и не бива
                // да се брои за успех: „Насрочени известия: N“ трябва да е вярно.
                print("[Каракочев] известието \(planned.requestID) не се насрочи: \(error.localizedDescription)")
            }
        }
        return scheduled
    }

    /// Колко известия реално чакат в системата — единственият честен източник.
    func pendingRequestsCount() async -> Int {
        await center.pendingNotificationRequests().count
    }

    /// Маха вече доставените известия от Центъра за известия (при отваряне на приложението).
    func clearDelivered() {
        center.removeAllDeliveredNotifications()
    }

    // MARK: - UNUserNotificationCenterDelegate

    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        // Показваме известието и когато приложението е отворено — иначе изглежда „изгубено“.
        [.banner, .list, .sound]
    }

    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse
    ) async {
        let requestID = response.notification.request.identifier
        guard let reminderID = NotificationPlanner.reminderID(fromRequestID: requestID) else { return }
        let actionIdentifier = response.actionIdentifier

        let action: NotificationAction
        if actionIdentifier == NotificationIdentifiers.complete {
            action = .complete(reminderID)
        } else if let option = NotificationIdentifiers.snoozeOption(from: actionIdentifier) {
            action = .snooze(reminderID, option)
        } else {
            action = .open(reminderID)
        }

        // Изчакваме обработката ДОКРАЙ (запис + пресинхронизиран план), докато
        // iOS още държи приложението будно заради този делегатски метод.
        await deliver(action)
    }

    private func deliver(_ action: NotificationAction) async {
        await onAction?(action)
    }
}
