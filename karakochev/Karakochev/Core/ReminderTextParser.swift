import Foundation

/// Какво е разпознато в написаното изречение.
public struct ParsedReminderInput: Equatable, Sendable {
    /// Текстът без частта за времето — това става заглавие на записката.
    public var title: String
    /// Разпознатият момент. `nil` → викащият слага стойност по подразбиране.
    public var date: Date?
    /// Разпознатото повторение. `nil` → еднократно.
    public var repeatRule: RepeatRule?
    /// Броят за „на всеки N дни/седмици“.
    public var interval: Int
    /// Разпозна ли изобщо нещо за времето (UI-ът показва ли подсказка).
    public var matchedSomething: Bool

    public init(
        title: String,
        date: Date? = nil,
        repeatRule: RepeatRule? = nil,
        interval: Int = 1,
        matchedSomething: Bool = false
    ) {
        self.title = title
        self.date = date
        self.repeatRule = repeatRule
        self.interval = interval
        self.matchedSomething = matchedSomething
    }
}

/// Вади ден, час и повторение от написаното на човешки език.
///
/// „плащане на ток вторник в 8“ → заглавие „плащане на ток“, вторник 08:00.
/// Работи на български, английски и италиански — езикът се подава отвън
/// (`Locale.current.language.languageCode`), а не се познава от текста.
///
/// Нарочно е **консервативен**: разпознава уверените случаи и мълчи за
/// останалите. Грешно разпознат час е по-лош от неразпознат — затова каквото не
/// е разбрано, остава в заглавието, а UI-ът винаги показва какво е избрал.
public struct ReminderTextParser: Sendable {
    public var calendar: Calendar
    public var language: Language

    public enum Language: String, Sendable, CaseIterable {
        case bulgarian = "bg"
        case english = "en"
        case italian = "it"

        /// Непознат език → английски (той е и резервният език на приложението).
        public init(code: String?) {
            self = Language(rawValue: String(code?.prefix(2) ?? "")) ?? .english
        }
    }

    public init(calendar: Calendar = .autoupdatingCurrent, language: Language = .english) {
        self.calendar = calendar
        self.language = language
    }

    // MARK: - Речник

    /// Ден от седмицата по номерацията на `Calendar` (1 = неделя).
    private var weekdays: [String: Int] {
        switch language {
        case .bulgarian:
            return [
                "неделя": 1, "понеделник": 2, "вторник": 3, "сряда": 4,
                "четвъртък": 5, "петък": 6, "събота": 7,
            ]
        case .english:
            return [
                "sunday": 1, "monday": 2, "tuesday": 3, "wednesday": 4,
                "thursday": 5, "friday": 6, "saturday": 7,
            ]
        case .italian:
            return [
                "domenica": 1, "lunedì": 2, "lunedi": 2, "martedì": 3, "martedi": 3,
                "mercoledì": 4, "mercoledi": 4, "giovedì": 5, "giovedi": 5,
                "venerdì": 6, "venerdi": 6, "sabato": 7,
            ]
        }
    }

    private var months: [String: Int] {
        switch language {
        case .bulgarian:
            return [
                "януари": 1, "февруари": 2, "март": 3, "април": 4, "май": 5, "юни": 6,
                "юли": 7, "август": 8, "септември": 9, "октомври": 10, "ноември": 11, "декември": 12,
            ]
        case .english:
            return [
                "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
                "july": 7, "august": 8, "september": 9, "october": 10, "november": 11, "december": 12,
            ]
        case .italian:
            return [
                "gennaio": 1, "febbraio": 2, "marzo": 3, "aprile": 4, "maggio": 5, "giugno": 6,
                "luglio": 7, "agosto": 8, "settembre": 9, "ottobre": 10, "novembre": 11, "dicembre": 12,
            ]
        }
    }

    /// Част от деня → час.
    private var dayParts: [String: Int] {
        switch language {
        case .bulgarian: return ["сутринта": 9, "обед": 12, "следобед": 15, "вечерта": 19, "довечера": 19]
        case .english: return ["morning": 9, "noon": 12, "afternoon": 15, "evening": 19, "tonight": 19]
        case .italian: return ["mattina": 9, "mezzogiorno": 12, "pomeriggio": 15, "sera": 19, "stasera": 19]
        }
    }

    private var todayWords: [String] {
        switch language {
        case .bulgarian: return ["днес"]
        case .english: return ["today"]
        case .italian: return ["oggi"]
        }
    }

    private var tomorrowWords: [String] {
        switch language {
        case .bulgarian: return ["утре"]
        case .english: return ["tomorrow"]
        case .italian: return ["domani"]
        }
    }

    private var dayAfterTomorrowWords: [String] {
        switch language {
        case .bulgarian: return ["вдругиден"]
        case .english: return []
        case .italian: return ["dopodomani"]
        }
    }

    /// Служебни думи, които не носят смисъл в заглавието („в“, „at“, „alle“).
    private var fillerWords: Set<String> {
        switch language {
        case .bulgarian: return ["в", "във", "на", "часа", "час", "ч"]
        case .english: return ["at", "on", "the", "o'clock"]
        case .italian: return ["alle", "alla", "il", "di", "ore"]
        }
    }

    private var everyWords: [String] {
        switch language {
        case .bulgarian: return ["всеки", "всяка", "всяко"]
        case .english: return ["every", "each"]
        case .italian: return ["ogni"]
        }
    }

    private var inWords: [String] {
        switch language {
        case .bulgarian: return ["след"]
        case .english: return ["in"]
        case .italian: return ["tra", "fra"]
        }
    }

    private var dayUnitWords: [String] {
        switch language {
        case .bulgarian: return ["ден", "дни", "дена"]
        case .english: return ["day", "days"]
        case .italian: return ["giorno", "giorni"]
        }
    }

    private var weekUnitWords: [String] {
        switch language {
        case .bulgarian: return ["седмица", "седмици"]
        case .english: return ["week", "weeks"]
        case .italian: return ["settimana", "settimane"]
        }
    }

    private var hourUnitWords: [String] {
        switch language {
        case .bulgarian: return ["час", "часа"]
        case .english: return ["hour", "hours"]
        case .italian: return ["ora", "ore"]
        }
    }

    private var minuteUnitWords: [String] {
        switch language {
        case .bulgarian: return ["минута", "минути"]
        case .english: return ["minute", "minutes"]
        case .italian: return ["minuto", "minuti"]
        }
    }

    private var monthWords: [String] {
        switch language {
        case .bulgarian: return ["месец", "месеца"]
        case .english: return ["month", "months"]
        case .italian: return ["mese", "mesi"]
        }
    }

    private var weekdayGroupWords: [String] {
        switch language {
        case .bulgarian: return ["делник", "делници", "делнично"]
        case .english: return ["weekday", "weekdays"]
        case .italian: return ["feriale", "feriali"]
        }
    }

    // MARK: - Разбор

    public func parse(_ text: String, now: Date) -> ParsedReminderInput {
        let tokens = Self.tokenize(text)
        guard !tokens.isEmpty else { return ParsedReminderInput(title: "") }

        var consumed = Set<Int>()
        var repeatRule: RepeatRule?
        var interval = 1
        var weekdayTarget: Int?
        var dayOffset: Int?
        var explicitDay: (day: Int, month: Int?)?
        var hour: Int?
        var minute = 0
        var relativeSeconds: TimeInterval?

        for (index, token) in tokens.enumerated() {
            let word = token.lowercased()

            // „всеки ден“, „всяка седмица“, „на всеки 3 дни“, „всеки понеделник“
            if everyWords.contains(word) {
                // Предлогът пред „всеки“ е част от израза, не от заглавието.
                if index > 0, fillerWords.contains(tokens[index - 1].lowercased()) {
                    consumed.insert(index - 1)
                }
                let following = tokens.dropFirst(index + 1).prefix(2).map { $0.lowercased() }
                if let first = following.first {
                    if let count = Int(first), following.count > 1 {
                        let unit = following[1]
                        if dayUnitWords.contains(unit) {
                            repeatRule = .everyNDays
                            interval = RepeatRule.clampInterval(count)
                            consumed.formUnion([index, index + 1, index + 2])
                            continue
                        }
                        if weekUnitWords.contains(unit) {
                            repeatRule = .everyNWeeks
                            interval = RepeatRule.clampInterval(count)
                            consumed.formUnion([index, index + 1, index + 2])
                            continue
                        }
                    }
                    if dayUnitWords.contains(first) {
                        repeatRule = .daily
                        consumed.formUnion([index, index + 1])
                        continue
                    }
                    if weekUnitWords.contains(first) {
                        repeatRule = .weekly
                        consumed.formUnion([index, index + 1])
                        continue
                    }
                    if monthWords.contains(first) {
                        repeatRule = .monthly
                        consumed.formUnion([index, index + 1])
                        continue
                    }
                    if weekdayGroupWords.contains(first) {
                        repeatRule = .weekdays
                        consumed.formUnion([index, index + 1])
                        continue
                    }
                    if let weekday = weekdays[first] {
                        repeatRule = .weekly
                        weekdayTarget = weekday
                        consumed.formUnion([index, index + 1])
                        continue
                    }
                    if let part = dayParts[first] {
                        repeatRule = .daily
                        hour = part
                        consumed.formUnion([index, index + 1])
                        continue
                    }
                }
            }

            // „след 2 часа“, „след 30 минути“, „след 3 дни“
            if inWords.contains(word) {
                let following = tokens.dropFirst(index + 1).prefix(2).map { $0.lowercased() }
                if following.count == 2, let count = Int(following[0]) {
                    let unit = following[1]
                    if hourUnitWords.contains(unit) {
                        relativeSeconds = TimeInterval(count) * 3600
                        consumed.formUnion([index, index + 1, index + 2])
                        continue
                    }
                    if minuteUnitWords.contains(unit) {
                        relativeSeconds = TimeInterval(count) * 60
                        consumed.formUnion([index, index + 1, index + 2])
                        continue
                    }
                    if dayUnitWords.contains(unit) {
                        dayOffset = count
                        consumed.formUnion([index, index + 1, index + 2])
                        continue
                    }
                }
            }

            if todayWords.contains(word) {
                dayOffset = 0
                consumed.insert(index)
                continue
            }
            if tomorrowWords.contains(word) {
                dayOffset = 1
                consumed.insert(index)
                continue
            }
            if dayAfterTomorrowWords.contains(word) {
                dayOffset = 2
                consumed.insert(index)
                continue
            }
            if let weekday = weekdays[word] {
                weekdayTarget = weekday
                consumed.insert(index)
                continue
            }
            if let part = dayParts[word] {
                hour = part
                consumed.insert(index)
                continue
            }

            // Час: „8:30“, „18:00“
            if let (parsedHour, parsedMinute) = Self.clockTime(word) {
                hour = parsedHour
                minute = parsedMinute
                consumed.insert(index)
                if index > 0, fillerWords.contains(tokens[index - 1].lowercased()) {
                    consumed.insert(index - 1)
                }
                continue
            }

            // Число: час („в 8“) или дата („15 август“, „15-ти“).
            if let number = Self.leadingNumber(word) {
                let previous = index > 0 ? tokens[index - 1].lowercased() : ""
                let next = index + 1 < tokens.count ? tokens[index + 1].lowercased() : ""

                if let month = months[next], (1...31).contains(number) {
                    explicitDay = (number, month)
                    consumed.formUnion([index, index + 1])
                    continue
                }
                if fillerWords.contains(previous), (0...23).contains(number) {
                    hour = number
                    minute = 0
                    consumed.formUnion([index - 1, index])
                    continue
                }
                if Self.isOrdinalDay(word, language: language), (1...31).contains(number) {
                    explicitDay = (number, nil)
                    consumed.insert(index)
                    continue
                }
            }

            // Дата с точки: „15.08“, „15.08.2026“
            if let parsed = Self.dottedDate(word) {
                explicitDay = (parsed.day, parsed.month)
                consumed.insert(index)
                continue
            }
        }

        let title = tokens.enumerated()
            .filter { !consumed.contains($0.offset) }
            .map(\.element)
            .joined(separator: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)

        let matched = !consumed.isEmpty
        let date = resolveDate(
            now: now,
            relativeSeconds: relativeSeconds,
            dayOffset: dayOffset,
            weekdayTarget: weekdayTarget,
            explicitDay: explicitDay,
            hour: hour,
            minute: minute
        )

        return ParsedReminderInput(
            title: title,
            date: date,
            repeatRule: repeatRule,
            interval: interval,
            matchedSomething: matched
        )
    }

    // MARK: - Сглобяване на датата

    private func resolveDate(
        now: Date,
        relativeSeconds: TimeInterval?,
        dayOffset: Int?,
        weekdayTarget: Int?,
        explicitDay: (day: Int, month: Int?)?,
        hour: Int?,
        minute: Int
    ) -> Date? {
        if let relativeSeconds {
            return now.addingTimeInterval(relativeSeconds)
        }

        // Няма нито ден, нито час → няма какво да предложим.
        guard dayOffset != nil || weekdayTarget != nil || explicitDay != nil || hour != nil else { return nil }

        let targetHour = hour ?? ReminderDefaults.fallbackHour
        var day = calendar.startOfDay(for: now)

        if let dayOffset {
            day = calendar.date(byAdding: .day, value: dayOffset, to: day) ?? day
        } else if let weekdayTarget {
            day = nextWeekday(weekdayTarget, onOrAfter: day) ?? day
        } else if let explicitDay {
            day = nextDate(day: explicitDay.day, month: explicitDay.month, after: now) ?? day
        }

        var components = calendar.dateComponents([.year, .month, .day], from: day)
        components.hour = targetHour
        components.minute = minute
        guard let candidate = calendar.date(from: components) else { return nil }

        // Само час, който вече е минал днес („в 8“ в 9 сутринта) → утре.
        if candidate <= now, dayOffset == nil, weekdayTarget == nil, explicitDay == nil {
            return calendar.date(byAdding: .day, value: 1, to: candidate)
        }
        return candidate
    }

    private func nextWeekday(_ weekday: Int, onOrAfter start: Date) -> Date? {
        for offset in 0..<7 {
            guard let candidate = calendar.date(byAdding: .day, value: offset, to: start) else { return nil }
            if calendar.component(.weekday, from: candidate) == weekday { return candidate }
        }
        return nil
    }

    private func nextDate(day: Int, month: Int?, after now: Date) -> Date? {
        var components = calendar.dateComponents([.year, .month], from: now)
        components.day = day
        if let month { components.month = month }

        guard let candidate = calendar.date(from: components) else { return nil }
        if calendar.startOfDay(for: candidate) >= calendar.startOfDay(for: now) { return candidate }

        // Датата е минала → същото число следващия месец (или следващата година).
        let unit: Calendar.Component = month == nil ? .month : .year
        return calendar.date(byAdding: unit, value: 1, to: candidate)
    }

    // MARK: - Дребни разпознавачи

    static func tokenize(_ text: String) -> [String] {
        text.split(whereSeparator: { $0 == " " || $0 == "\n" || $0 == "\t" || $0 == "," })
            .map(String.init)
            .filter { !$0.isEmpty }
    }

    /// „8:30“, „18.45“ → (18, 45). Само с разделител — иначе „15“ е ден, не час.
    static func clockTime(_ word: String) -> (Int, Int)? {
        let separators: [Character] = [":", "."]
        for separator in separators {
            let parts = word.split(separator: separator)
            guard parts.count == 2, let hour = Int(parts[0]), let minute = Int(parts[1]) else { continue }
            guard (0...23).contains(hour), (0...59).contains(minute) else { continue }
            // „15.08“ е дата, не час — двуцифрената „минута“ над 59 вече отпадна,
            // но и месец 8 минава за минута 8. Датата с точки се хваща по-долу,
            // затова тук искаме двуцифрена минута.
            guard parts[1].count == 2, separator == ":" || minute > 12 else { continue }
            return (hour, minute)
        }
        return nil
    }

    /// Водещото число на дума („15-ти“ → 15, „8“ → 8).
    static func leadingNumber(_ word: String) -> Int? {
        let digits = word.prefix { $0.isNumber }
        guard !digits.isEmpty, let value = Int(digits) else { return nil }
        return value
    }

    /// Има ли редна наставка („15-ти“, „15th“, „15º“).
    static func isOrdinalDay(_ word: String, language: Language) -> Bool {
        let suffixes: [String]
        switch language {
        case .bulgarian: suffixes = ["-ти", "-ви", "-ри", "ти", "ви", "ри"]
        case .english: suffixes = ["st", "nd", "rd", "th"]
        case .italian: suffixes = ["º", "°"]
        }
        let lowered = word.lowercased()
        return suffixes.contains { lowered.hasSuffix($0) && lowered.count > $0.count }
    }

    /// „15.08“ или „15.08.2026“ → (15, 8).
    static func dottedDate(_ word: String) -> (day: Int, month: Int)? {
        let parts = word.split(separator: ".").map(String.init)
        guard parts.count >= 2, let day = Int(parts[0]), let month = Int(parts[1]) else { return nil }
        guard (1...31).contains(day), (1...12).contains(month) else { return nil }
        return (day, month)
    }
}
