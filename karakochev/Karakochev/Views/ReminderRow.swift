import SwiftUI

/// Един ред от списъка. Работи върху копие (`ReminderSnapshot`) — рисуването
/// не пипа базата.
struct ReminderRow: View {
    let snapshot: ReminderSnapshot
    let isHighlighted: Bool
    let dateLabel: ReminderDateLabel

    private let calculator = OccurrenceCalculator()

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: snapshot.isDone ? "checkmark.circle.fill" : "circle")
                .foregroundStyle(snapshot.isDone ? Color.green : Color.accentColor)
                .font(.title3)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Text(snapshot.title)
                        .font(.body.weight(.medium))
                        .strikethrough(snapshot.isDone, color: .secondary)
                        .foregroundStyle(snapshot.isDone ? .secondary : .primary)
                    if snapshot.isImportant {
                        Image(systemName: "exclamationmark.circle.fill")
                            .foregroundStyle(.orange)
                            .accessibilityLabel(Text("row.important"))
                    }
                }

                if !snapshot.note.isEmpty {
                    Text(snapshot.note)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }

                HStack(spacing: 8) {
                    Label(scheduleText, systemImage: isOverdue ? "exclamationmark.triangle" : "bell")
                        .font(.caption)
                        // Собствен цвят вместо системното червено — то пада под
                        // 4.5:1 контраст при дребен шрифт (WCAG 1.4.3).
                        .foregroundStyle(isOverdue ? Color("OverdueColor") : Color.secondary)
                    if snapshot.repeatRule.isRepeating {
                        Text(snapshot.repeatRule.localizedShortTitle)
                            .font(.caption2)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color.secondary.opacity(0.15), in: Capsule())
                    }
                    if isSnoozed {
                        Text("row.snoozed")
                            .font(.caption2)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color.orange.opacity(0.18), in: Capsule())
                    }
                }
            }
        }
        .padding(.vertical, 2)
        .listRowBackground(isHighlighted ? Color.accentColor.opacity(0.16) : Color("BrandSurface"))
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityText)
    }

    /// Един момент за целия render — иначе четирите обръщения по-долу
    /// биха видели различно „сега“.
    private let now = Date()

    private var nextOccurrence: Date? {
        calculator.nextOccurrence(of: snapshot, after: now)
    }

    private var isOverdue: Bool {
        calculator.isOverdue(snapshot, now: now)
    }

    private var isSnoozed: Bool {
        calculator.activeSnooze(of: snapshot, after: now) != nil
    }

    private var scheduleText: String {
        if snapshot.isDone { return String(localized: "row.done") }
        if let next = nextOccurrence { return dateLabel.text(for: next, now: now) }
        return String(localized: "row.overdue \(dateLabel.text(for: snapshot.fireDate, now: now))")
    }

    private var accessibilityText: String {
        var parts = [snapshot.title]
        if !snapshot.note.isEmpty { parts.append(snapshot.note) }
        parts.append(scheduleText)
        if snapshot.repeatRule.isRepeating { parts.append(snapshot.repeatRule.localizedTitle) }
        // Капсулата „отложено“ е визуална — екранният четец трябва да я чуе.
        if isSnoozed { parts.append(String(localized: "row.snoozed")) }
        if snapshot.isImportant { parts.append(String(localized: "row.important")) }
        return parts.joined(separator: ", ")
    }
}
