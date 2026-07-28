import Foundation

/// Как се повтаря напомнянето.
///
/// Стойностите се пазят в базата като `rawValue` низ — затова **никога** не
/// преименувай съществуващ case (счупва вече записаните напомняния); добавяй нов.
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

    /// Ключът за превод. Текстът живее в `Localizable.xcstrings` (приложният
    /// слой) — ядрото няма език, за да може приложението да следва телефона.
    public var localizationKey: String { "repeat.\(rawValue)" }

    /// Ключът за късия етикет в реда на списъка.
    public var shortLocalizationKey: String { "repeat.short.\(rawValue)" }

    public var isRepeating: Bool { self != .once }
}
