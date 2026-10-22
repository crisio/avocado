import SwiftUI

/// Entrar → elegir tipo de cuenta → la app del paciente o la de la nutrióloga.
struct RootView: View {
    @Environment(Session.self) private var session
    @Environment(\.scenePhase) private var scenePhase
    @State private var celebrations = CelebrationCenter.shared

    var body: some View {
        Group {
            if let user = session.user {
                switch user.role {
                case nil: OnboardingView()
                case .nutritionist: CareTabs()
                case .patient: PatientEntry()
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
        .onOpenURL { AppRoute.shared.open($0) }
        .task { await session.refresh() }
        .onChange(of: scenePhase) {
            guard scenePhase == .active else { return }
            Task {
                await session.refresh()
                await Outbox.shared.flush()
                await ReminderScheduler.shared.refresh()
            }
        }
        // Avisos de comida: al entrar, al cambiar el ajuste y al subir una comida (el aviso de esa hora ya no hace falta).
        .task(id: "\(session.user?.id ?? "")\(session.user?.role?.rawValue ?? "")\(session.user?.remindersOn ?? true)") {
            await ReminderScheduler.shared.refresh(force: true)
        }
        .onChange(of: Outbox.shared.syncedCount) { Task { await ReminderScheduler.shared.refresh(force: true) } }
        // Reintenta la cola cada tanto mientras haya algo pendiente (por si la señal volvió sin avisar).
        .task {
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(20))
                if !Outbox.shared.jobs.isEmpty { await Outbox.shared.flush() }
            }
        }
    }
}

/// Tras elegir "Paciente": primero el permiso para la IA (una vez, y "Ahora no" sigue a la app); si lo salta, se le vuelve a pedir antes de la primera foto.
struct PatientEntry: View {
    @Environment(Session.self) private var session
    @State private var skipped = false

    private var askedKey: String { "avocado.consentAsked.\(session.user?.id ?? "")" }

    var body: some View {
        if session.user?.aiConsentAt == nil, !skipped, !UserDefaults.standard.bool(forKey: askedKey) {
            ScrollView {
                AiConsentView(onDecline: {
                    UserDefaults.standard.set(true, forKey: askedKey)
                    skipped = true
                })
                .padding(.horizontal, Theme.gutter)
                .padding(.vertical, 24)
            }
            .screenBackground()
        } else {
            MainTabs()
        }
    }
}

enum AppTab: Hashable {
    case today, week, avo, profile
}

struct MainTabs: View {
    @State private var tab: AppTab = .today
    @State private var avoPrompt = AvoPrompt.shared
    @State private var route = AppRoute.shared
    @State private var achievements = Achievements.shared
    @Environment(Session.self) private var session
    @Environment(\.scenePhase) private var scenePhase

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
        // Medallas y retos: al entrar, al volver a la app y al subir una comida.
        .task(id: "\(session.user?.id ?? "")-\(Outbox.shared.syncedCount)-\(scenePhase == .active)") {
            guard scenePhase == .active, let id = session.user?.id else { return }
            await achievements.refresh(userId: id)
        }
        .sheet(item: Binding(get: { achievements.celebrating }, set: { if $0 == nil { achievements.dismissCelebration() } })) { medal in
            MedalCelebrationView(medal: medal)
                .presentationDetents([.medium, .large])
        }
        .onChange(of: avoPrompt.pending) { if avoPrompt.pending != nil { tab = .avo } }
        .onChange(of: avoPrompt.draft) { if avoPrompt.draft != nil { tab = .avo } }
        .onChange(of: route.tab, initial: true) {
            guard let next = route.tab else { return }
            tab = next
            route.tab = nil
        }
    }
}

/// La app de la nutrióloga: sus pacientes y su perfil (con el código para invitar).
struct CareTabs: View {
    var body: some View {
        TabView {
            Tab("Pacientes", systemImage: "person.2.fill") {
                NavigationStack { CareDashboardView() }
            }
            Tab("Perfil", systemImage: "person.crop.circle") {
                NavigationStack { CareProfileView() }
            }
        }
    }
}

/// Para abrir el detalle de una comida desde cualquier lista.
struct MealRoute: Hashable {
    let id: String
}

/// Para abrir un día desde la semana (de otra persona si trae userId: lo usa la nutrióloga).
struct DayRoute: Hashable {
    let day: Date
    var userId: String?
    var goals: CareGoals?
}

extension View {
    func mealDestinations() -> some View {
        self
            .navigationDestination(for: MealRoute.self) { MealDetailView(mealId: $0.id) }
            .navigationDestination(for: DayRoute.self) { DayScreen(day: $0.day, userId: $0.userId, goals: $0.goals) }
    }
}
