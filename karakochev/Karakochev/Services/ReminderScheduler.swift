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
    /// Базата не се отвори и работим върху временна (в паметта) — виж `KarakochevApp`.
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
        planner: NotificationPlanner = NotificationPlanner(
            fallbackTitle: String(localized: "notification.fallbackTitle")
        ),
        isTemporaryStore: Bool = false,
        registerAsActionHandler: Bool = true
    ) {
        self.context = context
        self.service = service
        self.planner = planner
        self.isTemporaryStore = isTemporaryStore
        service.start()
        // `NotificationService.shared` е синглтон за целия процес. Временна
        // инстанция (напр. в App Intent, който се изпълнява ДОКАТО приложението
        // е отворено) не бива да поема действията от известията: тя умира с
        // `perform()`, а живият scheduler остава без делегат и бутоните
        // „Готово“/„Отложи“ спират тихо да работят до следващо студено пускане.
        if registerAsActionHandler {
            service.onAction = { [weak self] action in
                await self?.handle(action)
            }
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
            // Без разрешение няма план — и трите брояча се нулират, иначе банерът
            // „N напомняния са сведени до едно известие“ остава да виси от
            // последния разрешен план, след като потребителят е спрял известията.
            skippedReminders = 0
            reducedReminders = 0
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

    // MARK: - Бързо добавяне, износ и внос

    /// Създава записка от свободен текст („плащане на ток вторник в 8“).
    ///
    /// Връща записа, за да може UI-ът да покаже какво е разбрал; `nil`, ако
    /// след изваждането на времевата част не е останало заглавие.
    @discardableResult
    func addFromText(_ text: String, now: Date = Date()) -> Reminder? {
        let parser = ReminderTextParser(
            language: ReminderTextParser.Language(code: Locale.current.language.languageCode?.identifier)
        )
        let parsed = parser.parse(text, now: now)
        let title = parsed.title.isEmpty ? text.trimmingCharacters(in: .whitespacesAndNewlines) : parsed.title
        guard !title.isEmpty else { return nil }

        let reminder = Reminder(
            title: title,
            fireDate: parsed.date ?? ReminderDefaults.suggestedDate(now: now),
            repeatRule: parsed.repeatRule ?? .once,
            interval: parsed.interval
        )
        add(reminder)
        return reminder
    }

    /// Всички записки като архив за изнасяне.
    func exportArchive(now: Date = Date()) -> Data? {
        guard let reminders = fetchAll() else { return nil }
        return try? ReminderArchiveCoder.encode(reminders.map(\.snapshot), exportedAt: now)
    }

    /// Внася архив. Връща колко записа са добавени; хвърля при нечетим файл.
    ///
    /// Вносът **само добавя** — не трие и не презаписва. Стар архив не може да
    /// изтрие записка, направена след него.
    @discardableResult
    func importArchive(_ data: Data) throws -> Int {
        let imported = try ReminderArchiveCoder.decode(data)
        // `nil` е провалено четене, не празна база: с празен списък целият архив
        // би минал за нов и уникалният `id` би презаписал по-новите записи.
        guard let existing = fetchAll() else { throw ReminderArchiveCoder.ImportError.storeUnreadable }
        let fresh = ReminderArchiveCoder.newReminders(
            from: imported,
            existing: existing.map(\.snapshot)
        )
        for snapshot in fresh {
            context.insert(Reminder(archived: snapshot))
        }
        saveAndResync()
        return fresh.count
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
        // Сортираме след извличането: `SortDescriptor(\.fireDate)` вкарва
        // несъответстващ на Sendable KeyPath в дескриптора (грешка в Swift 6).
        let descriptor = FetchDescriptor<Reminder>()
        do {
            return try context.fetch(descriptor).sorted { $0.fireDate < $1.fireDate }
        } catch {
            print("[Каракочев] базата не се прочете: \(error.localizedDescription)")
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
            saveError = String(localized: "banner.saveError")
            print("[Каракочев] записът в базата не мина: \(error.localizedDescription)")
        }
    }
}
