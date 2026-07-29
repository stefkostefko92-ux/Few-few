import Foundation

/// Как се повтаря напомнянето.
///
/// Стойностите се пазят в базата като `rawValue` низ — затова **никога** не
/// преименувай съществуващ case (счупва вече записаните напомняния); добавяй нов.
///
/// Броят (напр. „на всеки 3 дни“) НЕ е асоциирана стойност, а отделно поле
/// `interval` в записа — иначе `rawValue` спира да е стабилен ключ за базата.
public enum RepeatRule: String, Codable, CaseIterable, Sendable {
    /// Еднократно — на точната дата и час.
    case once
    /// Всеки ден в същия час.
    case daily
    /// Всеки делник (понеделник–петък) в същия час.
    case weekdays
    /// Всяка седмица, в същия ден от седмицата и час.
    case weekly
    /// Всеки месец, на същото число. Месеците без това число се прескачат
    /// (напр. „31-во число“ не се задейства през февруари).
    case monthly
    /// Всяка година, на същата дата. 29 февруари се задейства само високосна година.
    case yearly
    /// На всеки `interval` дни.
    case everyNDays
    /// На всеки `interval` седмици, в същия ден от седмицата.
    case everyNWeeks
    /// Последният работен ден (пн–пт) от месеца — заплати, осигуровки, отчети.
    case lastWorkdayOfMonth

    /// Ключът за превод. Текстът живее в `Localizable.xcstrings` (приложният
    /// слой) — ядрото няма език, за да може приложението да следва телефона.
    public var localizationKey: String { "repeat.\(rawValue)" }

    /// Ключът за късия етикет в реда на списъка.
    public var shortLocalizationKey: String { "repeat.short.\(rawValue)" }

    public var isRepeating: Bool { self != .once }

    /// Ползва ли това правило броя `interval` (и трябва ли UI-ът да го покаже).
    public var usesInterval: Bool {
        self == .everyNDays || self == .everyNWeeks
    }

    /// Може ли правилото да се изрази с **един повтарящ се** тригер на iOS.
    ///
    /// `UNCalendarNotificationTrigger(repeats:)` съвпада по календарни компоненти
    /// (час, ден от седмицата, число, месец) — тоест умее „всеки ден в 7“, но не
    /// умее „на всеки 3 дни“ или „последния работен ден“, защото те не са
    /// постоянен набор компоненти. Тези правила се насрочват като поредица от
    /// отделни заявки, която се допълва при всяко отваряне на приложението.
    public var hasNativeTrigger: Bool {
        switch self {
        case .once, .everyNDays, .everyNWeeks, .lastWorkdayOfMonth: return false
        case .daily, .weekdays, .weekly, .monthly, .yearly: return true
        }
    }

    /// Разумните граници на броя — пази от „на всеки 0 дни“ (безкраен цикъл).
    public static let intervalRange = 1...30

    public static func clampInterval(_ value: Int) -> Int {
        min(max(value, intervalRange.lowerBound), intervalRange.upperBound)
    }
}
