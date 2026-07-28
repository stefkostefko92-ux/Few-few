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

    /// Заглавие за интерфейса (български — източник на истината).
    public var title: String {
        switch self {
        case .once: return "Еднократно"
        case .daily: return "Всеки ден"
        case .weekdays: return "Всеки делник (пн–пт)"
        case .weekly: return "Всяка седмица"
        case .monthly: return "Всеки месец"
        case .yearly: return "Всяка година"
        }
    }

    /// Кратък етикет за реда в списъка.
    public var shortTitle: String {
        switch self {
        case .once: return ""
        case .daily: return "дневно"
        case .weekdays: return "делници"
        case .weekly: return "седмично"
        case .monthly: return "месечно"
        case .yearly: return "годишно"
        }
    }

    public var isRepeating: Bool { self != .once }
}
