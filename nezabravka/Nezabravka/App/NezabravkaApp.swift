import SwiftData
import SwiftUI

/// „Незабравка“ — записки с напомняне. Всичко живее на устройството:
/// няма акаунт, няма сървър, няма мрежа.
@main
struct NezabravkaApp: App {
    private let container: ModelContainer
    @State private var scheduler: ReminderScheduler

    init() {
        let container = Self.makeContainer()
        self.container = container
        _scheduler = State(initialValue: ReminderScheduler(context: container.mainContext))
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(scheduler)
                .environment(\.locale, Locale(identifier: "bg_BG"))
        }
        .modelContainer(container)
    }

    private static func makeContainer() -> ModelContainer {
        let schema = Schema([Reminder.self])
        do {
            return try ModelContainer(
                for: schema,
                configurations: ModelConfiguration(schema: schema, isStoredInMemoryOnly: false)
            )
        } catch {
            // По-добре приложението да тръгне с временна база, отколкото да
            // се затвори при старт. Записите на диска не се пипат.
            print("[Незабравка] базата не се отвори (\(error.localizedDescription)) — временна база в паметта")
            do {
                return try ModelContainer(
                    for: schema,
                    configurations: ModelConfiguration(schema: schema, isStoredInMemoryOnly: true)
                )
            } catch {
                fatalError("[Незабравка] базата не може да се създаде: \(error)")
            }
        }
    }
}
