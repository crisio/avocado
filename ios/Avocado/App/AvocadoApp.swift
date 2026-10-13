import SwiftUI

@main
struct AvocadoApp: App {
    @State private var session = Session.shared
    @State private var outbox = Outbox.shared
    @State private var connectivity = Connectivity.shared
    @State private var streaks = StreakStore.shared

    init() {
        BrandFont.register()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(session)
                .environment(outbox)
                .environment(connectivity)
                .environment(streaks)
                .tint(Theme.accent)
                .environment(\.locale, Fmt.locale)
                .preferredColorScheme(.light)
        }
    }
}
