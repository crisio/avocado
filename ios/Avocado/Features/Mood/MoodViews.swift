import SwiftUI

/**
 "¿Cómo te sientes?" en un toque: eliges cómo te sientes (puedes elegir varios) y, si quieres, tu energía, si vas con tu
 plan y una nota. Avo te aconseja según la hora, tu última comida y cómo te has sentido. Lo ve tu nutrióloga.
 */
struct MoodCheckInView: View {
    var mealId: String?
    var title = "¿Cómo te sientes?"

    @Environment(Session.self) private var session
    @Environment(Connectivity.self) private var connectivity
    @State private var feelings: [Feeling] = []
    @State private var energy: Int?
    @State private var plan: OnPlan?
    @State private var note = ""
    @State private var busy = false
    @State private var error: String?
    @State private var saved: MoodEntry?

    private var hasConsent: Bool { session.user?.aiConsentAt != nil }

    var body: some View {
        Group {
            if let saved { result(saved) } else { form }
        }
        .card()
        .sensoryFeedback(.success, trigger: saved?.id)
    }

    @ViewBuilder private var form: some View {
        VStack(alignment: .leading, spacing: 14) {
            SectionTitle(title)
            FlowLayout(spacing: 8) {
                ForEach(Feeling.allCases) { f in
                    let on = feelings.contains(f)
                    Button {
                        if on { feelings.removeAll { $0 == f } } else { feelings.append(f) }
                    } label: {
                        Text("\(f.emoji) \(f.label)")
                            .font(.subheadline.weight(.semibold))
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .foregroundStyle(on ? Theme.accentStrong : Theme.ink)
                            .background(on ? Theme.accentSoft : Theme.surface, in: .capsule)
                            .overlay(Capsule().stroke(on ? Theme.accent : Theme.line, lineWidth: 1.5))
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(on ? .isSelected : [])
                }
            }
            if !feelings.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Tu energía (1 = nada, 5 = a tope)").font(.subheadline.weight(.semibold)).foregroundStyle(Theme.muted)
                    Picker("Tu energía", selection: $energy) {
                        ForEach(1...5, id: \.self) { Text("\($0)").tag(Optional($0)) }
                    }
                    .pickerStyle(.segmented)
                }
                VStack(alignment: .leading, spacing: 6) {
                    Text("¿Vas con tu plan?").font(.subheadline.weight(.semibold)).foregroundStyle(Theme.muted)
                    Picker("¿Vas con tu plan?", selection: $plan) {
                        ForEach(OnPlan.allCases) { Text($0.label).tag(Optional($0)) }
                    }
                    .pickerStyle(.segmented)
                }
                TextField("¿Algo más? Ej. dormí poco, mucho estrés…", text: $note, axis: .vertical)
                    .lineLimit(1...3)
                    .padding(12)
                    .background(Theme.sunken, in: .rect(cornerRadius: 14))
                if !connectivity.online { Notice(text: "Sin conexión: necesitas internet para guardarlo.", tone: .warning) }
                if let error { Notice(text: error, tone: .danger) }
                Button {
                    Task { await save() }
                } label: {
                    Group {
                        if busy { ProgressView().tint(.white) } else { Label(hasConsent ? "Guardar y pedirle consejo a Avo" : "Guardar", systemImage: "checkmark") }
                    }
                    .frame(maxWidth: .infinity)
                }
                .primaryButton()
                .disabled(busy || !connectivity.online)
            }
        }
    }

    @ViewBuilder private func result(_ mood: MoodEntry) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                MascotView(mood: mood.feelings.contains(.bien) ? .celebrate : .love, size: 64, pose: 3)
                VStack(alignment: .leading, spacing: 6) {
                    SectionTitle("¡Anotado!")
                    if let advice = mood.advice {
                        Text(advice.message).font(.body).foregroundStyle(Theme.ink)
                    } else {
                        Text(hasConsent
                            ? "Avo no pudo darte un consejo ahorita, pero quedó guardado y tu nutrióloga lo verá."
                            : "Quedó guardado y tu nutrióloga lo verá. Da permiso para la IA en Perfil y Avo te aconsejará.")
                            .font(.subheadline)
                            .foregroundStyle(Theme.muted)
                    }
                }
            }
            if let tips = mood.advice?.tips, !tips.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(tips, id: \.self) { tip in
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            Image(systemName: "leaf.fill").font(.caption).foregroundStyle(Theme.accent)
                            Text(tip).font(.subheadline)
                        }
                    }
                }
            }
            if mood.advice != nil {
                FinePrint("Consejo con IA: puede equivocarse y no es consejo médico. Sigue las indicaciones de tu nutrióloga.")
            }
            Button("Registrar otra vez") { reset() }.frame(maxWidth: .infinity)
        }
    }

    private func reset() {
        feelings = []
        energy = nil
        plan = nil
        note = ""
        saved = nil
        error = nil
    }

    private func save() async {
        guard !feelings.isEmpty else { return }
        busy = true
        error = nil
        if hasConsent { cheer(.think, "Déjame pensar…") }
        let trimmed = note.trimmingCharacters(in: .whitespacesAndNewlines)
        let body: [String: Any] = [
            "id": UUID().uuidString.lowercased(),
            "feelings": feelings.map(\.rawValue),
            "energy": energy.map { $0 as Any } ?? NSNull(),
            "on_plan": plan?.rawValue ?? NSNull(),
            "note": trimmed.isEmpty ? NSNull() : trimmed,
            "meal_id": mealId ?? NSNull(),
            "advise": true,
            "offset": Fmt.timezoneOffset,
        ]
        do {
            saved = try await APIClient.shared.request("POST", "/moods", json: body, timeout: 60)
            MoodsSignal.shared.bump()
            cheer(feelings.contains(.bien) ? .celebrate : .love, "¡Anotado!")
        } catch {
            self.error = error.localizedDescription
            cheer(.oops, "No pude guardarlo")
        }
        busy = false
    }
}

/// Un registro de ánimo en el día: cómo se sintió, su energía, si iba con su plan, su nota y el consejo de Avo.
struct MoodRow: View {
    let mood: MoodEntry
    let own: Bool
    @State private var confirmDelete = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("\(Fmt.time(mood.feltDate)) · Cómo \(own ? "te sentías" : "se sentía")\(mood.mealId != nil ? " después de comer" : "")")
                .font(.caption.weight(.semibold))
                .foregroundStyle(Theme.muted)
            FlowLayout(spacing: 6) {
                ForEach(mood.feelings) { f in
                    tag("\(f.emoji) \(f.label)", soft: false)
                }
                if let energy = mood.energy { tag("Energía \(energy)/5", soft: true) }
                if let plan = mood.onPlan { tag(plan.summary(own: own), soft: plan != .no, warning: plan == .no) }
            }
            if let note = mood.note, !note.isEmpty {
                Text("“\(note)”").italic().font(.subheadline).foregroundStyle(Theme.muted)
            }
            if let advice = mood.advice {
                Text("**Avo:** \(advice.message)").font(.subheadline).foregroundStyle(Theme.ink)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.surface, in: .rect(cornerRadius: 20))
        .overlay(alignment: .leading) {
            UnevenRoundedRectangle(topLeadingRadius: 20, bottomLeadingRadius: 20).fill(Theme.accent).frame(width: 5)
        }
        .contextMenu {
            if own { Button("Borrar", systemImage: "trash", role: .destructive) { confirmDelete = true } }
        }
        .confirmationDialog("¿Borrar este registro de cómo te sentías?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Borrar", role: .destructive) {
                Task {
                    let _: OKResponse? = try? await APIClient.shared.request("DELETE", "/moods/\(mood.id)")
                    MoodsSignal.shared.bump()
                }
            }
        }
        .accessibilityElement(children: .combine)
    }

    private func tag(_ text: String, soft: Bool, warning: Bool = false) -> some View {
        Text(text)
            .font(.footnote.weight(.semibold))
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .foregroundStyle(warning ? Theme.warningInk : soft ? Theme.muted : Theme.accentStrong)
            .background(warning ? Theme.warningSoft : soft ? Theme.sunken : Theme.accentSoft, in: .capsule)
    }
}

/// Patrones de la semana: horarios, cómo se sintió y lo que encuentra Avo con la IA al pedírselo.
struct PatternsCard: View {
    let userId: String
    let start: Date
    let meals: [Meal]

    @Environment(Connectivity.self) private var connectivity
    @State private var signal = MoodsSignal.shared
    @State private var moods: [MoodEntry] = []
    @State private var insights: Insights?
    @State private var busy = false
    @State private var error: String?

    private static let weekdays = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"]

    var body: some View {
        let timing = TimingStats(meals: meals)
        let feel = MoodStats(moods: moods)

        VStack(alignment: .leading, spacing: 12) {
            SectionTitle("Tus patrones")
            if let timing {
                line("🌅", "Primera comida a las **\(Fmt.time(timing.first))** y última a las **\(Fmt.time(timing.last))**, en promedio.")
                if let longest = timing.longest, longest.minutes >= 60 {
                    let day = Self.weekdays[Fmt.calendar.component(.weekday, from: longest.from) - 1]
                    line("⏳", "Lo más que pasaste sin comer en el día: **\(TimingStats.duration(longest.minutes))** (el \(day) desde las \(Fmt.time(longest.from))).")
                }
                if timing.late > 0 {
                    line("🌙", "**\(timing.late)** \(timing.late == 1 ? "comida" : "comidas") después de las 9 de la noche.")
                }
            }
            if let feel, let first = feel.top.first {
                line(first.0.emoji, "Lo que más sentiste: " + feel.top.map { "**\($0.0.label.lowercased())** (\($0.1))" }.joined(separator: ", ") + ".")
                if feel.energy != nil || feel.onPlan != nil {
                    let energy = feel.energy.map { "Energía promedio **\(String(format: "%.1f", $0))/5**. " } ?? ""
                    let plan = feel.onPlan.map { "Con tu plan **\($0.yes)** de \($0.total) \($0.total == 1 ? "vez" : "veces")." } ?? ""
                    line("⚡️", energy + plan)
                }
            } else {
                line("💬", "Registra cómo te sientes en Mi día para ver aquí tus patrones de ánimo.", muted: true)
            }

            if let insights {
                HStack(alignment: .top, spacing: 12) {
                    MascotView(mood: .celebrate, size: 56, pose: 3)
                    Text(insights.summary).font(.body.weight(.semibold))
                }
                ForEach(insights.patterns, id: \.title) { p in
                    Text("**\(p.title).** \(p.detail)").font(.subheadline)
                }
                if !insights.suggestions.isEmpty {
                    Text("Para la próxima semana").font(.subheadline.weight(.semibold)).foregroundStyle(Theme.muted)
                    ForEach(insights.suggestions, id: \.self) { s in
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            Image(systemName: "leaf.fill").font(.caption).foregroundStyle(Theme.accent)
                            Text(s).font(.subheadline)
                        }
                    }
                }
                FinePrint("Análisis con IA: puede equivocarse y no es consejo médico.")
            } else {
                if let error { Notice(text: error, tone: .danger) }
                Button {
                    Task { await ask() }
                } label: {
                    Group {
                        if busy { ProgressView() } else { Label("Que Avo encuentre mis patrones", systemImage: "sparkles") }
                    }
                    .frame(maxWidth: .infinity)
                }
                .secondaryButton()
                .disabled(busy || !connectivity.online)
            }
        }
        .card()
        .task(id: "\(start.timeIntervalSince1970)-\(signal.version)") {
            insights = nil
            if let list: [MoodEntry] = try? await APIClient.shared.request("GET", "/moods", query: range) { moods = list }
        }
    }

    private var range: [String: String] {
        ["user_id": userId, "from": Fmt.iso(start), "to": Fmt.iso(Fmt.addDays(start, 7))]
    }

    private func line(_ icon: String, _ text: String, muted: Bool = false) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Text(icon)
            Text(.init(text)).font(.subheadline).foregroundStyle(muted ? Theme.muted : Theme.ink)
        }
    }

    private func ask() async {
        busy = true
        error = nil
        cheer(.think, "Déjame revisar tu semana…")
        do {
            var query = range
            query["offset"] = String(Fmt.timezoneOffset)
            insights = try await APIClient.shared.request("GET", "/insights", query: query, timeout: 90)
            cheer(.celebrate, "¡Listo!")
        } catch {
            self.error = error.localizedDescription
            cheer(.oops, "No pude revisarla")
        }
        busy = false
    }
}

/// Acomoda las vistas en renglones, como texto (para los botones de cómo te sientes).
struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let rows = arrange(subviews, width: proposal.width ?? .infinity)
        return CGSize(width: proposal.width ?? rows.map(\.width).max() ?? 0, height: rows.last.map { $0.y + $0.height } ?? 0)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        for row in arrange(subviews, width: bounds.width) {
            var x = bounds.minX
            for index in row.items {
                let size = subviews[index].sizeThatFits(.unspecified)
                subviews[index].place(at: CGPoint(x: x, y: bounds.minY + row.y), proposal: ProposedViewSize(size))
                x += size.width + spacing
            }
        }
    }

    private struct Row {
        var items: [Int] = []
        var width: CGFloat = 0
        var height: CGFloat = 0
        var y: CGFloat = 0
    }

    private func arrange(_ subviews: Subviews, width: CGFloat) -> [Row] {
        var rows: [Row] = [Row()]
        for (index, view) in subviews.enumerated() {
            let size = view.sizeThatFits(.unspecified)
            if !rows[rows.count - 1].items.isEmpty, rows[rows.count - 1].width + spacing + size.width > width {
                let y = rows[rows.count - 1].y + rows[rows.count - 1].height + spacing
                rows.append(Row(y: y))
            }
            var row = rows[rows.count - 1]
            row.width += (row.items.isEmpty ? 0 : spacing) + size.width
            row.height = max(row.height, size.height)
            row.items.append(index)
            rows[rows.count - 1] = row
        }
        return rows
    }
}
