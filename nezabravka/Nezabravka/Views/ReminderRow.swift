import SwiftUI

/// Един ред от списъка. Работи върху копие (`ReminderSnapshot`) — рисуването
/// не пипа базата.
struct ReminderRow: View {
    let snapshot: ReminderSnapshot
    let isHighlighted: Bool
    let dateText: ReminderDateText

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
                            .accessibilityLabel("Важно")
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
                        .foregroundStyle(isOverdue ? Color.red : Color.secondary)
                    if snapshot.repeatRule.isRepeating {
                        Text(snapshot.repeatRule.shortTitle)
                            .font(.caption2)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color.secondary.opacity(0.15), in: Capsule())
                    }
                    if isSnoozed {
                        Text("отложено")
                            .font(.caption2)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color.orange.opacity(0.18), in: Capsule())
                    }
                }
            }
        }
        .padding(.vertical, 2)
        .listRowBackground(isHighlighted ? Color.accentColor.opacity(0.12) : nil)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityText)
    }

    private var now: Date { Date() }

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
        if snapshot.isDone { return "изпълнено" }
        if let next = nextOccurrence { return dateText.text(for: next, now: now) }
        return "просрочено — \(dateText.text(for: snapshot.fireDate, now: now))"
    }

    private var accessibilityText: String {
        var parts = [snapshot.title]
        if !snapshot.note.isEmpty { parts.append(snapshot.note) }
        parts.append(scheduleText)
        if snapshot.repeatRule.isRepeating { parts.append(snapshot.repeatRule.title) }
        if snapshot.isImportant { parts.append("важно") }
        return parts.joined(separator: ", ")
    }
}
