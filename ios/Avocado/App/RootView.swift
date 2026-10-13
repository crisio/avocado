import SwiftUI

/// Entrar → elegir tipo de cuenta → la app del paciente (la nutrióloga usa la web).
struct RootView: View {
    @Environment(Session.self) private var session
    @Environment(\.scenePhase) private var scenePhase
    @State private var celebrations = CelebrationCenter.shared

    var body: some View {
        Group {
            if let user = session.user {
                switch user.role {
                case nil: OnboardingView()
                case .nutritionist: NutritionistView()
                case .patient: MainTabs()
                }
            } else {
                LoginView()
            }
        }
        .overlay {
            if let info = celebrations.current {
                CelebrationView(info: info) { celebrations.current = nil }
            }
        }
        .animation(.spring(duration: 0.35), value: celebrations.current)
        .task { await session.refresh() }
        .onChange(of: scenePhase) {
            guard scenePhase == .active else { return }
            Task {
                await session.refresh()
                await Outbox.shared.flush()
            }
        }
        // Reintenta la cola cada tanto mientras haya algo pendiente (por si la señal volvió sin avisar).
        .task {
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(20))
                if !Outbox.shared.jobs.isEmpty { await Outbox.shared.flush() }
            }
        }
    }
}

enum AppTab: Hashable {
    case today, week, avo, profile
}

struct MainTabs: View {
    @State private var tab: AppTab = .today

    var body: some View {
        TabView(selection: $tab) {
            Tab("Mi día", systemImage: "sun.max.fill", value: .today) {
                NavigationStack { TodayView(showWeek: { tab = .week }) }
            }
            Tab("Semana", systemImage: "calendar", value: .week) {
                NavigationStack { WeekView() }
            }
            Tab("Avo", systemImage: "bubble.left.and.bubble.right.fill", value: .avo) {
                NavigationStack { AvoChatView() }
            }
            Tab("Perfil", systemImage: "person.crop.circle", value: .profile) {
                NavigationStack { ProfileView() }
            }
        }
    }
}

/// Para abrir el detalle de una comida desde cualquier lista.
struct MealRoute: Hashable {
    let id: String
}

/// Para abrir un día desde la semana.
struct DayRoute: Hashable {
    let day: Date
}

extension View {
    func mealDestinations() -> some View {
        self
            .navigationDestination(for: MealRoute.self) { MealDetailView(mealId: $0.id) }
            .navigationDestination(for: DayRoute.self) { DayScreen(day: $0.day) }
    }
}
