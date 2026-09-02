import Foundation
import SwiftData

/// Записът в базата (SwiftData). Живее само на устройството.
///
/// Логиката за дати и известия **не** стои тук — тя работи върху
/// `ReminderSnapshot` (виж `Core/`), за да е тествана без Xcode.
@Model
final class Reminder {
    /// Собствен идентификатор — стои и в идентификатора на iOS известието,
    /// за да може натиснатото известие да намери своя запис.
    @Attribute(.unique) var id: UUID
    var title: String
    var note: String
    /// Датата и часът на (първото) задействане.
    var fireDate: Date
    /// `RepeatRule.rawValue` — низ, за да не се чупи базата при добавяне на нов вид повторение.
    var repeatRuleRaw: String
    /// Броят за „на всеки N дни/седмици“. Стойност по подразбиране 1, за да
    /// могат вече записаните напомняния да се прочетат без миграция.
    var interval: Int = 1
    var isDone: Bool
    var isImportant: Bool
    var snoozedUntil: Date?
    var createdAt: Date
    var completedAt: Date?

    init(
        id: UUID = UUID(),
        title: String,
        note: String = "",
        fireDate: Date,
        repeatRule: RepeatRule = .once,
        interval: Int = 1,
        isImportant: Bool = false,
        createdAt: Date = Date()
    ) {
        self.id = id
        self.title = title
        self.note = note
        self.fireDate = fireDate
        self.repeatRuleRaw = repeatRule.rawValue
        self.interval = RepeatRule.clampInterval(interval)
        self.isDone = false
        self.isImportant = isImportant
        self.snoozedUntil = nil
        self.createdAt = createdAt
        self.completedAt = nil
    }

    var repeatRule: RepeatRule {
        get { RepeatRule(rawValue: repeatRuleRaw) ?? .once }
        set { repeatRuleRaw = newValue.rawValue }
    }

    /// Копието, върху което работи цялата логика в `Core/`.
    var snapshot: ReminderSnapshot {
        ReminderSnapshot(
            id: id,
            title: title,
            note: note,
            fireDate: fireDate,
            repeatRule: repeatRule,
            interval: interval,
            isDone: isDone,
            isImportant: isImportant,
            snoozedUntil: snoozedUntil
        )
    }

    /// Създава запис от внесен архив — пази същия идентификатор, за да не се
    /// дублира при повторен внос на същия файл.
    convenience init(archived: ReminderSnapshot) {
        self.init(
            id: archived.id,
            title: archived.title,
            note: archived.note,
            fireDate: archived.fireDate,
            repeatRule: archived.repeatRule,
            interval: archived.interval,
            isImportant: archived.isImportant
        )
        self.isDone = archived.isDone
        self.snoozedUntil = archived.snoozedUntil
    }

    // MARK: - Действия

    func markDone(at date: Date = Date()) {
        isDone = true
        completedAt = date
        snoozedUntil = nil
    }

    func markNotDone() {
        isDone = false
        completedAt = nil
    }

    /// Отлага напомнянето. Еднократното се мести изцяло (иначе остава завинаги
    /// просрочено); повтарящото се получава допълнително задействане, а
    /// шаблонът му остава непокътнат.
    ///
    /// Отлагането мести само **напред**: „След 10 минути“ върху записка за
    /// другия вторник не бива да я дърпа за днес и да изтрие избрания час.
    func snooze(until date: Date) {
        if repeatRule == .once {
            guard date > fireDate else { return }
            fireDate = date
            snoozedUntil = nil
        } else {
            guard date > (snoozedUntil ?? .distantPast) else { return }
            snoozedUntil = date
        }
    }

    /// Чисти изгорялото отлагане — извиква се при пресинхронизиране.
    /// Връща `true`, ако е имало какво да се изчисти.
    @discardableResult
    func clearExpiredSnooze(now: Date = Date()) -> Bool {
        guard let snoozedUntil, snoozedUntil <= now else { return false }
        self.snoozedUntil = nil
        return true
    }
}
