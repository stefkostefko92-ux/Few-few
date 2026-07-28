import SwiftData
import SwiftUI

/// Създаване и редакция на записка.
struct ReminderEditorView: View {
    enum Mode: Identifiable {
        case create
        case edit(Reminder)

        var id: String {
            switch self {
            case .create: return "create"
            case .edit(let reminder): return reminder.id.uuidString
            }
        }
    }

    let mode: Mode

    @Environment(\.dismiss) private var dismiss
    @Environment(ReminderScheduler.self) private var scheduler

    @State private var title = ""
    @State private var note = ""
    @State private var date = ReminderDefaults.suggestedDate()
    @State private var repeatRule: RepeatRule = .once
    @State private var isImportant = false
    @State private var didLoad = false

    private let calculator = OccurrenceCalculator()
    private let dateLabel = ReminderDateLabel()

    var body: some View {
        NavigationStack {
            Form {
                Section("editor.section.what") {
                    TextField("editor.title.placeholder", text: $title)
                        .submitLabel(.done)
                    TextField("editor.note.placeholder", text: $note, axis: .vertical)
                        .lineLimit(2...6)
                }

                Section("editor.section.when") {
                    DatePicker(
                        "editor.when",
                        selection: $date,
                        displayedComponents: [.date, .hourAndMinute]
                    )
                    Picker("editor.repeat", selection: $repeatRule) {
                        ForEach(RepeatRule.allCases, id: \.self) { rule in
                            Text(rule.localizedTitle).tag(rule)
                        }
                    }
                }

                if let warning = ReminderDefaults.warning(for: date, rule: repeatRule) {
                    Section {
                        Label(warning.localizedText, systemImage: "exclamationmark.triangle")
                            .foregroundStyle(Color("WarningColor"))
                            .font(.footnote)
                    }
                }

                Section {
                    Toggle("editor.important", isOn: $isImportant)
                } footer: {
                    Text("editor.important.footer")
                }

                if !upcoming.isEmpty {
                    Section("editor.section.upcoming") {
                        ForEach(upcoming, id: \.self) { occurrence in
                            Text(dateLabel.text(for: occurrence, now: Date()))
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                    }
                }

                if case .edit(let reminder) = mode {
                    Section {
                        Button("action.deleteReminder", role: .destructive) {
                            scheduler.delete(reminder)
                            dismiss()
                        }
                    }
                }
            }
            .listRowBackground(Color("BrandSurface"))
            .scrollContentBackground(.hidden)
            .background(Color("BrandBackground"))
            .navigationTitle(Text(isCreating ? "action.newReminder" : "editor.title.edit"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("action.cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("action.save") { save() }
                        .disabled(!canSave)
                }
            }
            .onAppear(perform: load)
        }
    }

    // MARK: - Състояние

    private var isCreating: Bool {
        if case .create = mode { return true }
        return false
    }

    private var trimmedTitle: String {
        title.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var canSave: Bool { !trimmedTitle.isEmpty }

    /// Показва какво точно ще се случи — най-честият източник на недоверие
    /// към напомнящите приложения е „ще се обади ли изобщо“.
    private var upcoming: [Date] {
        let draft = ReminderSnapshot(
            id: UUID(),
            title: trimmedTitle,
            note: note,
            fireDate: date,
            repeatRule: repeatRule,
            isDone: false,
            isImportant: isImportant
        )
        return calculator.occurrences(of: draft, after: Date(), limit: 3)
    }

    private func load() {
        guard !didLoad else { return }
        didLoad = true
        guard case .edit(let reminder) = mode else { return }
        title = reminder.title
        note = reminder.note
        date = reminder.fireDate
        repeatRule = reminder.repeatRule
        isImportant = reminder.isImportant
    }

    private func save() {
        switch mode {
        case .create:
            let reminder = Reminder(
                title: trimmedTitle,
                note: note.trimmingCharacters(in: .whitespacesAndNewlines),
                fireDate: date,
                repeatRule: repeatRule,
                isImportant: isImportant
            )
            scheduler.add(reminder)

        case .edit(let reminder):
            reminder.title = trimmedTitle
            reminder.note = note.trimmingCharacters(in: .whitespacesAndNewlines)
            reminder.fireDate = date
            reminder.repeatRule = repeatRule
            reminder.isImportant = isImportant
            // Ръчната промяна отменя отлагането — новият час е този, който важи.
            reminder.snoozedUntil = nil
            // Преместено напред във времето → записката отново е активна.
            if reminder.isDone, date > Date() { reminder.markNotDone() }
            scheduler.commitEdit(reminder)
        }
        dismiss()
    }
}
