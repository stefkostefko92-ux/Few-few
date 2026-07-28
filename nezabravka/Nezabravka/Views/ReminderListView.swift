import SwiftData
import SwiftUI
import UIKit

/// Началният екран: всички записки, подредени по раздели.
struct ReminderListView: View {
    @Environment(ReminderScheduler.self) private var scheduler
    @Query(sort: \Reminder.fireDate) private var reminders: [Reminder]

    @State private var searchText = ""
    @State private var editorMode: ReminderEditorView.Mode?

    private let grouping = ReminderGrouping()
    private let dateText = ReminderDateText()

    var body: some View {
        NavigationStack {
            List {
                if scheduler.isDenied {
                    NotificationPermissionBanner()
                }
                if scheduler.skippedReminders > 0 {
                    NotificationBudgetBanner(skipped: scheduler.skippedReminders)
                }

                ForEach(groups) { group in
                    Section(group.section.title) {
                        ForEach(group.items) { snapshot in
                            if let reminder = model(for: snapshot.id) {
                                row(for: reminder, snapshot: snapshot)
                            }
                        }
                    }
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("Незабравка")
            .searchable(text: $searchText, prompt: "Търсене в записките")
            .overlay {
                if reminders.isEmpty {
                    ContentUnavailableView(
                        "Няма записки",
                        systemImage: "bell.badge",
                        description: Text("Запиши какво да не забравиш и избери кога да те подсетя.")
                    )
                } else if groups.isEmpty {
                    ContentUnavailableView.search(text: searchText)
                }
            }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        editorMode = .create
                    } label: {
                        Label("Нова записка", systemImage: "plus")
                    }
                }
                ToolbarItem(placement: .status) {
                    if scheduler.isAuthorized {
                        Text("Насрочени известия: \(scheduler.scheduledCount)")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .sheet(item: $editorMode) { mode in
                ReminderEditorView(mode: mode)
            }
        }
    }

    // MARK: - Ред

    @ViewBuilder
    private func row(for reminder: Reminder, snapshot: ReminderSnapshot) -> some View {
        ReminderRow(
            snapshot: snapshot,
            isHighlighted: scheduler.highlightedReminderID == snapshot.id,
            dateText: dateText
        )
        .contentShape(Rectangle())
        .onTapGesture { editorMode = .edit(reminder) }
        .swipeActions(edge: .trailing) {
            Button(role: .destructive) {
                scheduler.delete(reminder)
            } label: {
                Label("Изтрий", systemImage: "trash")
            }
        }
        .swipeActions(edge: .leading) {
            Button {
                scheduler.toggleDone(reminder)
            } label: {
                Label(
                    reminder.isDone ? "Върни" : "Готово",
                    systemImage: reminder.isDone ? "arrow.uturn.backward" : "checkmark"
                )
            }
            .tint(reminder.isDone ? .orange : .green)
        }
        .contextMenu {
            Button {
                editorMode = .edit(reminder)
            } label: {
                Label("Редактирай", systemImage: "pencil")
            }
            if !reminder.isDone {
                Menu {
                    ForEach(SnoozeOption.allCases, id: \.self) { option in
                        Button(option.title) { scheduler.snooze(reminder, option: option) }
                    }
                } label: {
                    Label("Отложи", systemImage: "clock.arrow.circlepath")
                }
            }
            Button(role: .destructive) {
                scheduler.delete(reminder)
            } label: {
                Label("Изтрий", systemImage: "trash")
            }
        }
    }

    // MARK: - Данни

    private var groups: [ReminderGroup] {
        let snapshots = reminders.map(\.snapshot)
        return grouping.group(grouping.search(snapshots, query: searchText), now: Date())
    }

    private func model(for id: UUID) -> Reminder? {
        reminders.first { $0.id == id }
    }
}

/// Известията са изключени от Настройки — без тях приложението е само списък.
private struct NotificationPermissionBanner: View {
    var body: some View {
        Section {
            VStack(alignment: .leading, spacing: 8) {
                Label("Известията са изключени", systemImage: "bell.slash")
                    .font(.headline)
                Text(
                    "Записките се пазят, но телефонът няма да те подсети. Включи ги от Настройки → Незабравка → Известия."
                )
                .font(.subheadline)
                .foregroundStyle(.secondary)
                if let url = URL(string: UIApplication.openSettingsURLString) {
                    Link("Отвори Настройки", destination: url)
                        .font(.subheadline.weight(.semibold))
                }
            }
            .padding(.vertical, 4)
        }
    }
}

/// iOS пази най-много 64 чакащи локални известия — предупреждаваме честно.
private struct NotificationBudgetBanner: View {
    let skipped: Int

    var body: some View {
        Section {
            Label(
                "\(skipped) напомняния чакат ред — iOS насрочва най-много \(NotificationPlanner.iOSPendingLimit) известия наведнъж. Ще се насрочат сами, щом по-близките минат.",
                systemImage: "exclamationmark.triangle"
            )
            .font(.footnote)
            .foregroundStyle(.secondary)
        }
    }
}
