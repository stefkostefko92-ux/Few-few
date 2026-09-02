import SwiftData
import SwiftUI
import UIKit
import UniformTypeIdentifiers

/// Началният екран: всички записки, подредени по раздели.
struct ReminderListView: View {
    @Environment(ReminderScheduler.self) private var scheduler
    @Query(sort: \Reminder.fireDate) private var reminders: [Reminder]

    @State private var searchText = ""
    @State private var editorMode: ReminderEditorView.Mode?
    @State private var exportDocument: ArchiveDocument?
    @State private var isExporting = false
    @State private var showExportWarning = false
    @State private var isImporting = false
    @State private var showImportResult = false
    @State private var importMessage = ""

    private let grouping = ReminderGrouping()
    private let dateLabel = ReminderDateLabel()

    var body: some View {
        NavigationStack {
            List {
                if scheduler.isTemporaryStore {
                    TemporaryStoreBanner()
                }
                if let saveError = scheduler.saveError {
                    SaveErrorBanner(message: saveError) { scheduler.dismissSaveError() }
                }
                if scheduler.isDenied {
                    NotificationPermissionBanner()
                }
                if scheduler.skippedReminders > 0 || scheduler.reducedReminders > 0 {
                    NotificationBudgetBanner(
                        skipped: scheduler.skippedReminders,
                        reduced: scheduler.reducedReminders
                    )
                }

                Section {
                    QuickAddField()
                }

                ForEach(groups) { group in
                    Section(group.section.localizedTitle) {
                        ForEach(group.items) { snapshot in
                            if let reminder = model(for: snapshot.id) {
                                row(for: reminder, snapshot: snapshot)
                            }
                        }
                    }
                }
            }
            .listRowBackground(Color("BrandSurface"))
            .listStyle(.insetGrouped)
            // Въглеродният фон на Carbon Stealth вместо системния групиран.
            .scrollContentBackground(.hidden)
            .background(Color("BrandBackground"))
            .navigationTitle(Text("list.title"))
            .searchable(text: $searchText, prompt: Text("list.search"))
            .overlay {
                if reminders.isEmpty {
                    ContentUnavailableView(
                        "list.empty.title",
                        systemImage: "bell.badge",
                        description: Text("list.empty.body")
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
                        Label("action.newReminder", systemImage: "plus")
                    }
                }
                ToolbarItem(placement: .topBarLeading) {
                    Menu {
                        Button {
                            showExportWarning = true
                        } label: {
                            Label("action.export", systemImage: "square.and.arrow.up")
                        }
                        Button {
                            isImporting = true
                        } label: {
                            Label("action.import", systemImage: "square.and.arrow.down")
                        }
                    } label: {
                        Label("action.more", systemImage: "ellipsis.circle")
                    }
                }
                ToolbarItem(placement: .status) {
                    if scheduler.isAuthorized {
                        Text("list.scheduled \(scheduler.scheduledCount)")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .sheet(item: $editorMode) { mode in
                ReminderEditorView(mode: mode)
            }
            // Файлът е нешифрован и може да тръгне към iCloud Drive — човекът го
            // научава ПРЕДИ да избере къде да го запише, не от SECURITY.md.
            .confirmationDialog("export.confirm.title", isPresented: $showExportWarning, titleVisibility: .visible) {
                Button("action.export") { startExport() }
                Button("action.cancel", role: .cancel) {}
            } message: {
                Text("export.confirm.message")
            }
            .fileExporter(
                isPresented: $isExporting,
                document: exportDocument,
                contentType: .json,
                defaultFilename: ReminderArchiveCoder.fileName(for: Date())
            ) { result in
                if case .failure = result {
                    importMessage = String(localized: "export.failed")
                    showImportResult = true
                }
            }
            .fileImporter(isPresented: $isImporting, allowedContentTypes: [.json]) { result in
                importArchive(result)
            }
            .alert("import.result", isPresented: $showImportResult) {
                Button("banner.saveError.dismiss", role: .cancel) {}
            } message: {
                Text(importMessage)
            }
        }
    }

    // MARK: - Ред

    @ViewBuilder
    private func row(for reminder: Reminder, snapshot: ReminderSnapshot) -> some View {
        Button {
            editorMode = .edit(reminder)
        } label: {
            ReminderRow(
                snapshot: snapshot,
                isHighlighted: scheduler.highlightedReminderID == snapshot.id,
                dateLabel: dateLabel
            )
        }
        // Бутон, а не `onTapGesture` — иначе екранният четец не обявява роля
        // и активирането с VoiceOver не е гарантирано (WCAG 4.1.2).
        .buttonStyle(.plain)
        .swipeActions(edge: .trailing) {
            Button(role: .destructive) {
                scheduler.delete(reminder)
            } label: {
                Label("action.delete", systemImage: "trash")
            }
        }
        .swipeActions(edge: .leading) {
            Button {
                scheduler.toggleDone(reminder)
            } label: {
                Label(
                    doneActionTitle(for: reminder),
                    systemImage: reminder.isDone ? "arrow.uturn.backward" : "checkmark"
                )
            }
            .tint(reminder.isDone ? .orange : .green)
        }
        .contextMenu {
            Button {
                editorMode = .edit(reminder)
            } label: {
                Label("action.edit", systemImage: "pencil")
            }
            if !reminder.isDone {
                Menu {
                    ForEach(SnoozeOption.allCases, id: \.self) { option in
                        Button(option.localizedTitle) { scheduler.snooze(reminder, option: option) }
                    }
                } label: {
                    Label("action.snooze", systemImage: "clock.arrow.circlepath")
                }
            }
            Button(role: .destructive) {
                scheduler.delete(reminder)
            } label: {
                Label("action.delete", systemImage: "trash")
            }
        }
    }

    // MARK: - Данни

    private var groups: [ReminderGroup] {
        let snapshots = reminders.map(\.snapshot)
        return grouping.group(grouping.search(snapshots, query: searchText), now: Date())
    }

    /// Плъзгането архивира ЦЯЛОТО напомняне. За повторение това значи „спри“,
    /// не „това задействане е свършено“ (последното е бутонът в известието).
    private func doneActionTitle(for reminder: Reminder) -> LocalizedStringKey {
        if reminder.isDone { return "action.undo" }
        return reminder.repeatRule.isRepeating ? "action.stop" : "action.done"
    }

    private func model(for id: UUID) -> Reminder? {
        reminders.first { $0.id == id }
    }

    // MARK: - Износ и внос

    /// Един тап → системният диалог за запис на файл (Files, iCloud Drive).
    private func startExport() {
        guard let data = scheduler.exportArchive() else {
            importMessage = String(localized: "export.failed")
            showImportResult = true
            return
        }
        exportDocument = ArchiveDocument(data: data)
        isExporting = true
    }

    private func importArchive(_ result: Result<URL, Error>) {
        guard case .success(let url) = result else {
            importMessage = String(localized: "import.failed")
            showImportResult = true
            return
        }
        // Файлът идва отвън (Files, iCloud Drive) → нужен е обхватен достъп.
        let opened = url.startAccessingSecurityScopedResource()
        defer { if opened { url.stopAccessingSecurityScopedResource() } }

        do {
            let count = try scheduler.importArchive(Data(contentsOf: url))
            importMessage = String(localized: "import.added \(count)")
        } catch ReminderArchiveCoder.ImportError.tooNew {
            importMessage = String(localized: "import.tooNew")
        } catch ReminderArchiveCoder.ImportError.tooLarge {
            importMessage = String(localized: "import.tooLarge")
        } catch ReminderArchiveCoder.ImportError.storeUnreadable {
            importMessage = String(localized: "import.storeUnreadable")
        } catch {
            importMessage = String(localized: "import.failed")
        }
        showImportResult = true
    }
}

/// Архивът като документ — `fileExporter` иска `FileDocument`, не сурови данни.
private struct ArchiveDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.json] }

    var data: Data

    init(data: Data) {
        self.data = data
    }

    init(configuration: ReadConfiguration) throws {
        guard let contents = configuration.file.regularFileContents else {
            throw CocoaError(.fileReadCorruptFile)
        }
        data = contents
    }

    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        FileWrapper(regularFileWithContents: data)
    }
}

/// Известията са изключени от Настройки — без тях приложението е само списък.
private struct NotificationPermissionBanner: View {
    var body: some View {
        Section {
            VStack(alignment: .leading, spacing: 8) {
                Label("banner.permission.title", systemImage: "bell.slash")
                    .font(.headline)
                Text("banner.permission.body")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                if let url = URL(string: UIApplication.openSettingsURLString) {
                    Link("action.openSettings", destination: url)
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
    let reduced: Int

    var body: some View {
        Section {
            Label(text, systemImage: "exclamationmark.triangle")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
    }

    private var text: String {
        // Всяко изречение носи ЕДНО число — така формите за единствено и
        // множествено число („1 чака“ / „2 чакат“) се избират правилно от
        // каталога. Лимитът на iOS е отделно изречение по същата причина.
        var parts: [String] = []
        if reduced > 0 {
            parts.append(String(localized: "banner.budget.reduced \(reduced)"))
        }
        if skipped > 0 {
            parts.append(String(localized: "banner.budget.skipped \(skipped)"))
        }
        parts.append(String(localized: "banner.budget.limit \(NotificationPlanner.iOSPendingLimit)"))
        return parts.joined(separator: " ")
    }
}

/// Базата не се отвори — записите на диска са невидими, но непокътнати.
private struct TemporaryStoreBanner: View {
    var body: some View {
        Section {
            VStack(alignment: .leading, spacing: 8) {
                Label("banner.temporaryStore.title", systemImage: "externaldrive.badge.exclamationmark")
                    .font(.headline)
                    .foregroundStyle(Color("OverdueColor"))
                Text("banner.temporaryStore.body")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            .padding(.vertical, 4)
        }
    }
}

/// Записът в базата се провали — мълчаливото преглъщане е по-лошо от грозен банер.
private struct SaveErrorBanner: View {
    let message: String
    let dismiss: () -> Void

    var body: some View {
        Section {
            VStack(alignment: .leading, spacing: 8) {
                Label(message, systemImage: "exclamationmark.icloud")
                    .font(.subheadline)
                    .foregroundStyle(Color("OverdueColor"))
                Button("banner.saveError.dismiss", action: dismiss)
                    .font(.subheadline.weight(.semibold))
            }
            .padding(.vertical, 4)
        }
    }
}
