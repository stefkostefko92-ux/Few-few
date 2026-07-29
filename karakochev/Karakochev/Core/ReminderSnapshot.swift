import Foundation

/// Неизменяемо копие на едно напомняне — това, което чистата логика (сметки за
/// повторения, планиране на известия, групиране) вижда.
///
/// Нарочно е отделено от `Reminder` (@Model, SwiftData): така цялото ядро е
/// Foundation-only, компилира се и се тества на Linux/CI без Xcode.
public struct ReminderSnapshot: Identifiable, Hashable, Sendable {
    public let id: UUID
    public var title: String
    public var note: String
    /// Първото (или единственото) задействане. За повтарящите се напомняния това
    /// е и „началото“ — по-ранни задействания няма.
    public var fireDate: Date
    public var repeatRule: RepeatRule
    /// Броят за „на всеки N дни/седмици“. Игнорира се от другите правила.
    ///
    /// Ограничава се при **всяко** присвояване, не само в init-а: „на всеки 0 дни“
    /// би завъртяло сметката за следващото задействане в безкраен цикъл.
    public var interval: Int {
        didSet { interval = RepeatRule.clampInterval(interval) }
    }
    /// Приключено — не се насрочва повече.
    public var isDone: Bool
    /// Важно → известието се доставя като „чувствително към времето“ (пробива
    /// „Не безпокойте“, ако потребителят е разрешил).
    public var isImportant: Bool
    /// Отложено „за после“. Пази се в базата (а не като отделно известие),
    /// за да преживее рестарт на приложението и пресинхронизация на плана.
    public var snoozedUntil: Date?

    public init(
        id: UUID,
        title: String,
        note: String = "",
        fireDate: Date,
        repeatRule: RepeatRule = .once,
        interval: Int = 1,
        isDone: Bool = false,
        isImportant: Bool = false,
        snoozedUntil: Date? = nil
    ) {
        self.id = id
        self.title = title
        self.note = note
        self.fireDate = fireDate
        self.repeatRule = repeatRule
        self.interval = RepeatRule.clampInterval(interval)
        self.isDone = isDone
        self.isImportant = isImportant
        self.snoozedUntil = snoozedUntil
    }

    /// Заглавието без празните знаци; `nil`, ако не е останало нищо. Резервният
    /// текст се подава отвън (`NotificationPlanner.fallbackTitle`), защото е
    /// потребителски низ и подлежи на превод.
    public var trimmedTitle: String? {
        let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    /// Текст на известието — бележката, ако има такава.
    public var notificationBody: String {
        note.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
