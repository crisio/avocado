import SwiftUI

/// Tarjeta compacta del ayuno intermitente: anillo, cronómetro en vivo y la ventana de comida.
struct FastingCard: View {
    @Environment(Session.self) private var session
    @Environment(Outbox.self) private var outbox
    @Environment(\.scenePhase) private var scenePhase
    @State private var status: FastingStatus?
    @State private var picking = false
    @State private var startedAt = Date.now
    @State private var saving = false
    @State private var error: String?

    private var hours: Int? { session.user?.fastingHours }

    var body: some View {
        Group {
            if let status, let plan = status.plan {
                content(status, plan)
            }
        }
        .task(id: "\(hours ?? 0)-\(session.user?.eatingStart ?? "")-\(outbox.syncedCount)-\(scenePhase == .active)") {
            guard scenePhase == .active else { return }
            await reload()
        }
    }

    private func content(_ status: FastingStatus, _ plan: FastingStatus.Plan) -> some View {
        TimelineView(.everyMinute) { context in
            let live = Self.liveHours(status, now: context.date)
            let goal = status.current.goalHours ?? Double(plan.hours)
            let reached = status.current.startedAt != nil && live >= goal
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 14) {
                    ZStack {
                        Circle().stroke(Theme.sunken, lineWidth: 8)
                        Circle()
                            .trim(from: 0, to: min(1, goal > 0 ? live / goal : 0))
                            .stroke(reached ? Theme.accent : Theme.orange, style: StrokeStyle(lineWidth: 8, lineCap: .round))
                            .rotationEffect(.degrees(-90))
                        Text(plan.label).font(.caption.weight(.bold)).foregroundStyle(Theme.ink)
                    }
                    .frame(width: 60, height: 60)
                    VStack(alignment: .leading, spacing: 2) {
                        if status.current.startedAt != nil {
                            Text(FastingStatus.duration(live))
                                .font(.display(24, weight: 800, relativeTo: .title2))
                                .foregroundStyle(Theme.ink)
                                .contentTransition(.numericText())
                        }
                        Text(line(status, plan, reached: reached))
                            .font(.subheadline)
                            .foregroundStyle(Theme.muted)
                    }
                    Spacer(minLength: 0)
                }
                if let today = todayLine(status) {
                    Text(today).font(.footnote).foregroundStyle(Theme.muted)
                }
                if status.isFasting || status.current.startedAt != nil {
                    Button("¿Cómo alargo mi ayuno? Pregúntale a Avo") {
                        AvoPrompt.shared.prefill("¿Cómo puedo alargar mi ayuno? Mi plan es \(plan.label) y hoy llevo \(Int(live)) horas.")
                    }
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Theme.accentStrong)
                }
                if status.state == "ventana" || status.current.startedAt == nil {
                    if picking {
                        HStack {
                            DatePicker("Empecé a las", selection: $startedAt, in: Date.now.addingTimeInterval(-48 * 3600)...Date.now, displayedComponents: [.date, .hourAndMinute])
                                .labelsHidden()
                            Spacer()
                            Button("Listo") { Task { await saveStart() } }.disabled(saving).font(.subheadline.weight(.semibold))
                        }
                    } else {
                        Button("Empecé mi ayuno") { startedAt = .now; picking = true }
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(Theme.accentStrong)
                    }
                }
                if let error { Text(error).font(.footnote).foregroundStyle(Theme.danger) }
            }
            .card(padding: 14)
            .onChange(of: reached, initial: true) { if reached { celebrate(status, plan) } }
        }
    }

    private func line(_ status: FastingStatus, _ plan: FastingStatus.Plan, reached: Bool) -> String {
        if reached { return "¡Ayuno de \(plan.hours) h cumplido! 💪" }
        if status.isFasting {
            return "Ayunando · tu ventana abre a las \(FastingStatus.clock(plan.eatingStart))"
        }
        if status.state == "ventana" { return "Ventana abierta hasta las \(FastingStatus.clock(plan.eatingEnd))" }
        return "Tu ventana abre a las \(FastingStatus.clock(plan.eatingStart))"
    }

    private func todayLine(_ status: FastingStatus) -> String? {
        guard let first = status.today?.firstMealAt else { return nil }
        var text = "Hoy: primera comida \(Fmt.time(Fmt.date(first)))"
        if let last = status.today?.lastMealAt, last != first { text += " · última \(Fmt.time(Fmt.date(last)))" }
        return text
    }

    static func liveHours(_ status: FastingStatus, now: Date) -> Double {
        guard let iso = status.current.startedAt else { return 0 }
        return max(0, now.timeIntervalSince(Fmt.date(iso)) / 3600)
    }

    /// Una vez por ayuno (se recuerda por la hora en que empezó).
    private func celebrate(_ status: FastingStatus, _ plan: FastingStatus.Plan) {
        guard let started = status.current.startedAt else { return }
        let key = "avocado.fastCelebrated"
        guard UserDefaults.standard.string(forKey: key) != started else { return }
        UserDefaults.standard.set(started, forKey: key)
        cheer(.celebrate, AvoStyle.current == .picante
            ? "¡\(plan.hours) horas sin comer y sin llorar! 💪 Ahora sí, a comer rico (y con foto)"
            : "¡Ayuno de \(plan.hours) h cumplido! Rómpelo con algo de proteína 💪")
    }

    private func reload() async {
        if let fresh = await FastingStatus.load() { status = fresh }
    }

    private func saveStart() async {
        saving = true
        error = nil
        do {
            try await session.update(["fast_started_at": Fmt.iso(min(startedAt, .now))])
            picking = false
            await reload()
        } catch {
            self.error = error.localizedDescription
        }
        saving = false
    }
}
