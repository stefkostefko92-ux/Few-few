import SwiftData
import SwiftUI

/// „Незабравка“ — записки с напомняне. Всичко живее на устройството:
/// няма акаунт, няма сървър, няма мрежа.
@main
struct NezabravkaApp: App {
    private let container: ModelContainer
    @State private var scheduler: ReminderScheduler

    init() {
        let (container, isTemporary) = Self.makeContainer()
        self.container = container
        _scheduler = State(
            initialValue: ReminderScheduler(context: container.mainContext, isTemporaryStore: isTemporary)
        )
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(scheduler)
                .environment(\.locale, Locale(identifier: "bg_BG"))
        }
        .modelContainer(container)
    }

    /// Връща контейнера и дали е **временен** (в паметта).
    ///
    /// Разликата е критична: временната база изглежда като „нула напомняния“,
    /// а нула напомняния означава празен план — който би изтрил всички вече
    /// насрочени известия за записи, които всъщност си стоят на диска.
    private static func makeContainer() -> (ModelContainer, Bool) {
        let schema = Schema([Reminder.self])
        do {
            let container = try ModelContainer(
                for: schema,
                configurations: ModelConfiguration(schema: schema, isStoredInMemoryOnly: false)
            )
            return (container, false)
        } catch {
            // По-добре приложението да тръгне с временна база, отколкото да
            // се затвори при старт. Записите на диска не се пипат.
            print("[Незабравка] базата не се отвори (\(error.localizedDescription)) — временна база в паметта")
            do {
                let container = try ModelContainer(
                    for: schema,
                    configurations: ModelConfiguration(schema: schema, isStoredInMemoryOnly: true)
                )
                return (container, true)
            } catch {
                fatalError("[Незабравка] базата не може да се създаде: \(error)")
            }
        }
    }
}
