import SwiftUI

struct RootView: View {
    @Environment(ReminderScheduler.self) private var scheduler
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        ReminderListView()
            .task {
                // Първо отваряне → питаме за разрешение; после само сверяваме.
                await scheduler.requestAuthorizationIfNeeded()
            }
            .onChange(of: scenePhase) { _, phase in
                guard phase == .active else { return }
                scheduler.clearDeliveredNotifications()
                Task { await scheduler.refresh() }
            }
    }
}
