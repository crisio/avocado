import SwiftUI

/**
 "¿Te aviso a la hora de comer?" en un toque. Sale en Mi día solo si aún no se ha decidido el permiso de avisos, ya usó la app
 (registró algo o lleva más de un día) y no la quitó en los últimos 7 días. Se quita deslizándola (o con la ✕).
 */
struct ReminderPromptCard: View {
    @Environment(Session.self) private var session
    @Environment(StreakStore.self) private var streaks
    @State private var scheduler = ReminderScheduler.shared
    @State private var dismissed = false
    @State private var busy = false

    private static let hideFor: TimeInterval = 7 * 86400

    private var userId: String { session.user?.id ?? "" }
    private var dismissKey: String { "avocado.remindersPromptDismissed.\(userId)" }
    private var firstSeenKey: String { "avocado.firstSeen.\(userId)" }

    private var eligible: Bool {
        guard session.user?.role == .patient, scheduler.status == .notDetermined, !dismissed else { return false }
        let defaults = UserDefaults.standard
        if Date.now.timeIntervalSince1970 - defaults.double(forKey: dismissKey) < Self.hideFor { return false }
        let loggedAny = streaks.streak.map { $0.best > 0 || $0.week.contains { $0.logged } } ?? false
        let first = defaults.double(forKey: firstSeenKey)
        return loggedAny || (first > 0 && Date.now.timeIntervalSince1970 - first > 86400)
    }

    var body: some View {
        Group {
            if eligible {
                VStack(alignment: .leading, spacing: 12) {
                    HStack(alignment: .top, spacing: 12) {
                        MascotView(mood: .wave, size: 52, pose: 3)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("¿Te aviso a la hora de comer? 🔔").font(.headline).foregroundStyle(Theme.ink)
                            Text("Desayuno, comida y cena. Si ya registraste, no te molesto.").font(.subheadline).foregroundStyle(Theme.muted)
                        }
                        Spacer(minLength: 0)
                        Button(action: dismiss) {
                            Image(systemName: "xmark").font(.subheadline.weight(.semibold)).foregroundStyle(Theme.muted).frame(width: 32, height: 32)
                        }
                        .accessibilityLabel("Quitar esta tarjeta")
                    }
                    HStack(spacing: 10) {
                        Button {
                            Task { await accept() }
                        } label: {
                            Text("Sí, avísame").frame(maxWidth: .infinity)
                        }
                        .primaryButton()
                        .disabled(busy)
                        Button("Ahora no", action: dismiss).disabled(busy)
                    }
                }
                .card(padding: 16)
                .swipeToDismiss(dismiss)
                .transition(.opacity.combined(with: .move(edge: .leading)))
            }
        }
        .task {
            await scheduler.loadStatus()
            if UserDefaults.standard.double(forKey: firstSeenKey) == 0, !userId.isEmpty {
                UserDefaults.standard.set(Date.now.timeIntervalSince1970, forKey: firstSeenKey)
            }
        }
    }

    private func dismiss() {
        UserDefaults.standard.set(Date.now.timeIntervalSince1970, forKey: dismissKey)
        withAnimation(.easeOut(duration: 0.2)) { dismissed = true }
    }

    private func accept() async {
        busy = true
        let granted = await scheduler.enable()
        busy = false
        if granted {
            cheer(.love, AvoStyle.current == .picante ? "Va, te voy a estar molestando a la hora de comer 😏" : "Listo, te escribo a la hora de comer 🔔")
        } else {
            dismiss()
        }
    }
}
