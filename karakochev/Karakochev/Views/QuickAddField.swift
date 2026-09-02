import SwiftUI

/// Полето за бързо добавяне най-горе в списъка.
///
/// Смисълът му е един: записка за две секунди, без отваряне на редактор.
/// Написаното минава през `ReminderTextParser`, а под полето се показва какво е
/// разбрано — за да няма изненади („утре в 8“ да се окаже след година).
struct QuickAddField: View {
    @Environment(ReminderScheduler.self) private var scheduler

    @State private var text = ""
    @FocusState private var isFocused: Bool

    private let dateLabel = ReminderDateLabel()

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 10) {
                Image(systemName: "plus.circle.fill")
                    .foregroundStyle(Color.accentColor)
                    .accessibilityHidden(true)

                TextField("quickAdd.placeholder", text: $text)
                    .focused($isFocused)
                    .submitLabel(.done)
                    .onSubmit(submit)

                if !text.isEmpty {
                    Button(action: submit) {
                        Image(systemName: "arrow.up.circle.fill")
                            .font(.title3)
                    }
                    .accessibilityLabel(Text("action.save"))
                }
            }

            if let preview {
                Text(preview)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .accessibilityLabel(Text("quickAdd.understood \(preview)"))
            }
        }
        .padding(.vertical, 2)
    }

    /// Какво е разбрано от написаното — показва се, докато пишеш.
    private var preview: String? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }

        let now = Date()
        let parser = ReminderTextParser(
            language: ReminderTextParser.Language(code: Locale.current.language.languageCode?.identifier)
        )
        let parsed = parser.parse(trimmed, now: now)
        let date = parsed.date ?? ReminderDefaults.suggestedDate(now: now)

        var parts = [dateLabel.text(for: date, now: now)]
        if let rule = parsed.repeatRule {
            parts.append(rule.localizedTitle(interval: parsed.interval))
        }
        return parts.joined(separator: " · ")
    }

    private func submit() {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        scheduler.addFromText(trimmed)
        text = ""
        isFocused = false
    }
}
