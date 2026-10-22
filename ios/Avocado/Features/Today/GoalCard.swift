import SwiftUI

/**
 "¿Qué quieres lograr?" en Mi día: objetivo (bajar, mantener, subir) y meta de calorías en un toque. Sale solo a pacientes
 sin objetivo o sin meta (que su nutrióloga no haya puesto), que ya registraron una comida y no la quitaron en los últimos
 7 días. Se quita deslizándola (o con la ✕).
 */
struct GoalCard: View {
    @Environment(Session.self) private var session
    @Environment(StreakStore.self) private var streaks
    @State private var dismissed = false
    @State private var busy = false
    @State private var error: String?
    @State private var other = false
    @State private var otherText = ""

    private static let hideFor: TimeInterval = 7 * 86400
    private static let presets = [1500, 1800, 2000, 2200, 2500]

    private var userId: String { session.user?.id ?? "" }
    private var hideKey: String { "avocado.goalCardHiddenUntil.\(userId)" }

    private var eligible: Bool {
        guard let user = session.user, user.role == .patient, user.goalsSetBy == nil, !dismissed else { return false }
        guard user.goal == nil || user.dailyKcalGoal == nil else { return false }
        if Date.now.timeIntervalSince1970 < UserDefaults.standard.double(forKey: hideKey) { return false }
        return streaks.streak.map { $0.best > 0 || $0.week.contains { $0.logged } } ?? false
    }

    var body: some View {
        if eligible {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .top, spacing: 12) {
                    MascotView(mood: .wave, size: 52, pose: 3)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("¿Qué quieres lograr? 🎯").font(.headline).foregroundStyle(Theme.ink)
                        Text("Con tu objetivo y tu meta, Avo te aconseja mejor y ves tu saldo de la semana.")
                            .font(.subheadline).foregroundStyle(Theme.muted)
                    }
                    Spacer(minLength: 0)
                    Button(action: dismiss) {
                        Image(systemName: "xmark").font(.subheadline.weight(.semibold)).foregroundStyle(Theme.muted).frame(width: 32, height: 32)
                    }
                    .accessibilityLabel("Quitar esta tarjeta")
                }
                if session.user?.goal == nil {
                    FlowLayout(spacing: 8) {
                        chip("Bajar de peso") { await save(["goal": Goal.bajar.rawValue]) }
                        chip("Mantener") { await save(["goal": Goal.mantener.rawValue]) }
                        chip("Subir (volumen)") { await save(["goal": Goal.subir.rawValue]) }
                    }
                } else {
                    Text("¿Tu meta de calorías al día?").font(.subheadline.weight(.semibold)).foregroundStyle(Theme.ink)
                    FlowLayout(spacing: 8) {
                        ForEach(Self.presets, id: \.self) { kcal in
                            chip(Fmt.number(Double(kcal))) { await save(["daily_kcal_goal": kcal]) }
                        }
                        chip("Otra") { other = true }
                        chip("No sé") { dismiss() }
                    }
                    if other {
                        HStack(spacing: 10) {
                            TextField("Ej. 1900", text: $otherText).keyboardType(.numberPad).textFieldStyle(.roundedBorder).frame(maxWidth: 140)
                            Button("Guardar") {
                                guard let value = Int(otherText.trimmingCharacters(in: .whitespaces)) else {
                                    error = "Escribe un número de calorías."
                                    return
                                }
                                Task { await save(["daily_kcal_goal": value]) }
                            }
                            .disabled(busy || otherText.isEmpty)
                        }
                    }
                }
                if let error { Notice(text: error, tone: .danger) }
            }
            .card(padding: 16)
            .swipeToDismiss(dismiss)
            .transition(.opacity.combined(with: .move(edge: .leading)))
        }
    }

    private func chip(_ title: String, action: @escaping () async -> Void) -> some View {
        Button { Task { await action() } } label: {
            Text(title).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.ink)
                .padding(.horizontal, 14).padding(.vertical, 9)
                .background(Theme.accentSoft, in: .capsule)
        }
        .buttonStyle(.plain)
        .disabled(busy)
    }

    private func save(_ fields: [String: Any]) async {
        guard !busy else { return }
        busy = true
        error = nil
        do {
            let updated = try await session.update(fields)
            if updated.goal != nil, updated.dailyKcalGoal != nil {
                cheer(.celebrate, AvoStyle.current == .picante ? "¡Eso! Ya sé a dónde vamos. Ahora no hay excusas 😏" : "¡Listo! Con esto te ayudo mejor 💚")
            }
        } catch {
            self.error = error.localizedDescription
        }
        busy = false
    }

    private func dismiss() {
        UserDefaults.standard.set(Date.now.timeIntervalSince1970 + Self.hideFor, forKey: hideKey)
        withAnimation(.easeOut(duration: 0.2)) { dismissed = true }
    }
}
