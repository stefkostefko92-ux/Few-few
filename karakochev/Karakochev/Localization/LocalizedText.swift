import Foundation

/// Мостът между безезиковото ядро и езика на телефона.
///
/// Ядрото (`Core/`) връща ключове и стойности, не изречения — така логиката се
/// тества на Linux, а текстът следва системния език на устройството. Всички
/// преводи живеят в `Resources/Localizable.xcstrings`.

extension RepeatRule {
    var localizedTitle: String {
        String(localized: String.LocalizationValue(localizationKey))
    }

    /// Заглавие с броя за правилата, които го ползват („на всеки 3 дни“).
    /// Числото минава през каталога, за да има вярна форма за единствено число.
    func localizedTitle(interval: Int) -> String {
        guard usesInterval else { return localizedTitle }
        switch self {
        case .everyNDays: return String(localized: "repeat.everyNDays.count \(interval)")
        case .everyNWeeks: return String(localized: "repeat.everyNWeeks.count \(interval)")
        default: return localizedTitle
        }
    }

    /// Късият етикет в реда на списъка („дневно“, „на 3 дни“). Еднократното няма етикет.
    func localizedShortTitle(interval: Int) -> String {
        guard isRepeating else { return "" }
        switch self {
        case .everyNDays: return String(localized: "repeat.short.everyNDays.count \(interval)")
        case .everyNWeeks: return String(localized: "repeat.short.everyNWeeks.count \(interval)")
        default: return String(localized: String.LocalizationValue(shortLocalizationKey))
        }
    }
}

extension ReminderSection {
    var localizedTitle: String {
        String(localized: String.LocalizationValue(localizationKey))
    }
}

extension SnoozeOption {
    var localizedTitle: String {
        String(localized: String.LocalizationValue(localizationKey))
    }
}

extension ReminderWarning {
    var localizedText: String {
        String(localized: String.LocalizationValue(localizationKey))
    }
}

/// Изписва кога се задейства напомнянето, на езика и в календара на телефона.
///
/// Часовете, дните и месеците ги форматира Foundation (`FormatStyle`) — затова
/// „12 август в 8:30“ на друг телефон става „12 August at 8:30 AM“ без нито един
/// заков в кода. Ние даваме само шаблона („%1$@ в %2$@“).
struct ReminderDateLabel {
    var classifier: ReminderDayClassifier
    var locale: Locale

    init(calendar: Calendar = .autoupdatingCurrent, locale: Locale = .autoupdatingCurrent) {
        self.classifier = ReminderDayClassifier(calendar: calendar)
        self.locale = locale
    }

    func text(for date: Date, now: Date) -> String {
        let bucket = classifier.bucket(for: date, now: now)
        let time = date.formatted(.dateTime.locale(locale).hour().minute())
        let template = String(localized: String.LocalizationValue(bucket.localizationKey))

        switch bucket {
        case .today, .tomorrow, .yesterday:
            return String(format: template, time)
        case .withinWeek:
            let weekday = date.formatted(.dateTime.locale(locale).weekday(.wide))
            return String(format: template, weekday, time)
        case .later:
            let day =
                classifier.isSameYear(date, as: now)
                ? date.formatted(.dateTime.locale(locale).day().month(.wide))
                : date.formatted(.dateTime.locale(locale).day().month(.wide).year())
            return String(format: template, day, time)
        }
    }
}
