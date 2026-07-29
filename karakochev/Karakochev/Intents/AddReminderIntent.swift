import AppIntents
import Foundation
import SwiftData

/// „Ей, Siri, добави записка…“ — и същото действие в Преки пътища.
///
/// Работи и когато приложението не е отворено: iOS стартира процеса, ние
/// отваряме същата база и пресинхронизираме известията. Затова тук се ползва
/// собствен `ModelContainer`, а не този на `KarakochevApp` — приложението може
/// изобщо да не е било пуснато.
struct AddReminderIntent: AppIntent {
    static var title: LocalizedStringResource = "intent.add.title"
    static var description = IntentDescription("intent.add.description")

    /// Отварянето на приложението би било по-бавно и излишно — записката се
    /// създава наум и Siri само потвърждава.
    static var openAppWhenRun: Bool = false

    @Parameter(title: "intent.add.parameter", requestValueDialog: "intent.add.prompt")
    var text: String

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        let container = try ModelContainer(for: Reminder.self)
        // `registerAsActionHandler: false` — този scheduler живее само докато
        // трае `perform()`. Ако поемеше действията от известията, щеше да остави
        // приложението без работещи бутони „Готово“/„Отложи“.
        let scheduler = ReminderScheduler(
            context: container.mainContext,
            registerAsActionHandler: false
        )

        guard let reminder = scheduler.addFromText(text) else {
            return .result(dialog: IntentDialog("intent.add.empty"))
        }

        // Изчакваме плана да е насрочен, преди да отговорим — иначе процесът
        // може да заспи с половин свършена работа.
        await scheduler.resync()

        let label = ReminderDateLabel().text(for: reminder.fireDate, now: Date())
        return .result(dialog: IntentDialog("intent.add.confirmation \(reminder.title) \(label)"))
    }
}

/// Готовите фрази, които Siri разпознава без потребителят да ги настройва.
///
/// `\(.applicationName)` е задължителна част от фразата — Apple иска името на
/// приложението в нея, за да няма сблъсък между приложения.
struct KarakochevShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: AddReminderIntent(),
            phrases: [
                "Добави записка в \(.applicationName)",
                "Напомни ми с \(.applicationName)",
                "Add a reminder to \(.applicationName)",
                "Remind me with \(.applicationName)",
                "Aggiungi un promemoria in \(.applicationName)",
            ],
            shortTitle: "intent.add.title",
            systemImageName: "bell.badge"
        )
    }
}
