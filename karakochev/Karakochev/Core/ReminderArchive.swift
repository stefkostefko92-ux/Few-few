import Foundation

/// Един запис в архивния файл.
///
/// Нарочно е **отделен** тип от `ReminderSnapshot`: форматът на файла е договор
/// с бъдещето (изнесен днес, внесен след две години), а снапшотът е вътрешна
/// структура, която се мени свободно. Смесването им прави всяка вътрешна
/// промяна счупване на архива.
public struct ArchivedReminder: Codable, Equatable, Sendable {
    public var id: UUID
    public var title: String
    public var note: String
    public var fireDate: Date
    public var repeatRule: String
    public var interval: Int
    public var isDone: Bool
    public var isImportant: Bool
    public var snoozedUntil: Date?

    public init(snapshot: ReminderSnapshot) {
        self.id = snapshot.id
        self.title = snapshot.title
        self.note = snapshot.note
        self.fireDate = snapshot.fireDate
        self.repeatRule = snapshot.repeatRule.rawValue
        self.interval = snapshot.interval
        self.isDone = snapshot.isDone
        self.isImportant = snapshot.isImportant
        self.snoozedUntil = snapshot.snoozedUntil
    }

    /// Непознато правило (файл от по-нова версия) → еднократно, вместо изхвърляне
    /// на записа. По-добре напомняне с грешно повторение, отколкото загубено.
    public var snapshot: ReminderSnapshot {
        ReminderSnapshot(
            id: id,
            title: title,
            note: note,
            fireDate: fireDate,
            repeatRule: RepeatRule(rawValue: repeatRule) ?? .once,
            interval: interval,
            isDone: isDone,
            isImportant: isImportant,
            snoozedUntil: snoozedUntil
        )
    }
}

/// Съдържанието на изнесения файл.
public struct ReminderArchive: Codable, Equatable, Sendable {
    /// Версия на **формата**, не на приложението. Вдига се само при промяна,
    /// която стар четец не може да разбере.
    public static let currentVersion = 1

    public var version: Int
    public var exportedAt: Date
    public var reminders: [ArchivedReminder]

    public init(reminders: [ReminderSnapshot], exportedAt: Date) {
        self.version = Self.currentVersion
        self.exportedAt = exportedAt
        self.reminders = reminders.map(ArchivedReminder.init)
    }
}

/// Изнася и внася записките като един JSON файл.
///
/// Това е единственият начин данните да напуснат телефона — и то само когато
/// потребителят сам натисне „Изнеси“. Няма мрежа, няма автоматично качване.
public enum ReminderArchiveCoder {
    public enum ImportError: Error, Equatable {
        /// Файлът не е JSON или не е архив на приложението.
        case unreadable
        /// Архив от по-нова версия на формата.
        case tooNew(version: Int)
        /// Файлът е над тавана — не е архив на това приложение по размер.
        case tooLarge
        /// Собствената база не се прочете — вносът би дублирал или презаписал.
        case storeUnreadable
    }

    /// Тавани за внос. Файлът идва отвън (Files, iCloud Drive) и е недоверен:
    /// без таван 10 000 записа се внасят „успешно“ и после всеки пресинхрон и
    /// всяко отваряне на списъка стават секунди. Личен архив е стотици записи;
    /// 5 000 е ред величина над реалното.
    public static let maxReminders = 5_000
    /// Над 2 MB не е наш архив (5 000 записа с бележки са ~1.5 MB): не го и парсваме.
    public static let maxBytes = 2 * 1_024 * 1_024

    public static func encode(_ reminders: [ReminderSnapshot], exportedAt: Date) throws -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        return try encoder.encode(ReminderArchive(reminders: reminders, exportedAt: exportedAt))
    }

    public static func decode(_ data: Data) throws -> [ReminderSnapshot] {
        guard data.count <= maxBytes else { throw ImportError.tooLarge }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        guard let archive = try? decoder.decode(ReminderArchive.self, from: data) else {
            throw ImportError.unreadable
        }
        guard archive.version <= ReminderArchive.currentVersion else {
            throw ImportError.tooNew(version: archive.version)
        }
        guard archive.reminders.count <= maxReminders else { throw ImportError.tooLarge }
        return archive.reminders.map(\.snapshot)
    }

    /// Име на файла с дата — за да не се презаписват два износа в един ден.
    public static func fileName(for date: Date, calendar: Calendar = .autoupdatingCurrent) -> String {
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        let year = parts.year ?? 0
        let month = parts.month ?? 0
        let day = parts.day ?? 0
        return String(format: "karakochev-%04d-%02d-%02d.json", year, month, day)
    }

    /// Кои от внесените записи са нови спрямо вече наличните (по идентификатор).
    ///
    /// Внасянето **не трие** нищо: то само добавя липсващите. Така файл от стар
    /// бекъп не може да изтрие записка, направена след него.
    public static func newReminders(
        from imported: [ReminderSnapshot],
        existing: [ReminderSnapshot]
    ) -> [ReminderSnapshot] {
        // Двойник вътре в самия файл също не минава два пъти — иначе двоен запис
        // с един уникален ключ и „внесени N“ по-голямо от реално добавените.
        var seen = Set(existing.map(\.id))
        return imported.filter { seen.insert($0.id).inserted }
    }
}
