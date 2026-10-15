import SwiftUI

/**
 "¿Cómo te sientes?" en un toque: una fila de emojis; al tocar uno se guarda y Avo te aconseja según la hora, tu última
 comida y cómo te has sentido. Lo ve tu nutrióloga. La tarjeta se quita deslizándola (o con la ✕); en Mi día
 (`remember`) no vuelve a salir por 3 horas. Para contar más (energía, si vas con tu plan…), el chat con Avo.
 */
struct MoodCheckInView: View {
    var mealId: String?
    var title = "¿Cómo te sientes?"
    var remember: Bool?

    private static let hideFor: TimeInterval = 3 * 3600

    @Environment(Session.self) private var session
    @Environment(Connectivity.self) private var connectivity
    @AppStorage("avocado.moodHiddenUntil") private var hiddenUntil: Double = 0
    @State private var sending: Feeling?
    @State private var saved: MoodEntry?
    @State private var error: String?
    @State private var dismissed = false

    private var remembers: Bool { remember ?? (mealId == nil) }
    private var hasConsent: Bool { session.user?.aiConsentAt != nil }
    /// En Mi día se esconde un rato después de registrar o quitarla (pero el consejo recién dado se queda a la vista).
    private var hidden: Bool {
        dismissed || (remembers && saved == nil && sending == nil && Date.now.timeIntervalSince1970 < hiddenUntil)
    }

    var body: some View {
        if !hidden {
            Group {
                if let saved { result(saved) } else { picker }
            }
            .card(padding: 16)
            .swipeToDismiss(dismiss)
            .sensoryFeedback(.success, trigger: saved?.id)
            .transition(.opacity.combined(with: .move(edge: .leading)))
        }
    }

    private var closeButton: some View {
        Button(action: dismiss) {
            Image(systemName: "xmark").font(.subheadline.weight(.semibold)).foregroundStyle(Theme.muted).frame(width: 32, height: 32)
        }
        .accessibilityLabel("Quitar esta tarjeta")
    }

    private var picker: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                SectionTitle(title)
                Spacer(minLength: 8)
                closeButton
            }
            HStack(spacing: 0) {
                ForEach(Feeling.allCases) { f in
                    Button { Task { await pick(f) } } label: {
                        VStack(spacing: 3) {
                            Text(f.emoji)
                                .font(.system(size: 28))
                                .scaleEffect(sending == f ? 1.18 : 1)
                                .animation(sending == f ? .easeInOut(duration: 0.5).repeatForever() : .default, value: sending)
                            Text(f.short)
                                .font(.caption2.weight(.semibold))
                                .foregroundStyle(Theme.muted)
                                .lineLimit(1)
                                .minimumScaleFactor(0.7)
                        }
                        .frame(maxWidth: .infinity, minHeight: 58)
                        .background(sending == f ? Theme.accentSoft : .clear, in: .rect(cornerRadius: 14))
                        .contentShape(.rect)
                    }
                    .buttonStyle(.plain)
                    .disabled(sending != nil || !connectivity.online)
                    .opacity(sending != nil && sending != f ? 0.45 : 1)
                    .accessibilityLabel(f.label)
                }
            }
            if sending != nil { FinePrint("Avo está pensando…") }
            if !connectivity.online { Notice(text: "Sin conexión: necesitas internet para guardarlo.", tone: .warning) }
            if let error { Notice(text: error, tone: .danger) }
        }
    }

    @ViewBuilder private func result(_ mood: MoodEntry) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                MascotView(mood: mood.feelings.contains(.bien) ? .celebrate : .love, size: 56, pose: 3)
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        SectionTitle("¡Anotado!")
                        Spacer(minLength: 8)
                        closeButton
                    }
                    if let advice = mood.advice {
                        Text(advice.message).font(.body).foregroundStyle(Theme.ink)
                        if let gif = advice.gif { GifView(gif: gif) }
                    } else {
                        Text(hasConsent
                            ? "Quedó guardado y tu nutrióloga lo verá."
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
            FinePrint((mood.advice != nil ? "Consejo con IA: puede equivocarse y no es consejo médico. " : "") + "Desliza la tarjeta para quitarla.")
        }
    }

    private func dismiss() {
        if remembers { hiddenUntil = Date.now.timeIntervalSince1970 + Self.hideFor }
        withAnimation(.easeOut(duration: 0.2)) { dismissed = true }
    }

    private func pick(_ feeling: Feeling) async {
        guard sending == nil else { return }
        sending = feeling
        error = nil
        if hasConsent { cheer(.think, "Déjame pensar…") }
        let body: [String: Any] = [
            "id": UUID().uuidString.lowercased(),
            "feelings": [feeling.rawValue],
            "meal_id": mealId ?? NSNull(),
            "advise": true,
            "offset": Fmt.timezoneOffset,
        ]
        do {
            let mood: MoodEntry = try await APIClient.shared.request("POST", "/moods", json: body, timeout: 60)
            withAnimation(.spring(duration: 0.35)) { saved = mood }
            if remembers { hiddenUntil = Date.now.timeIntervalSince1970 + Self.hideFor }
            MoodsSignal.shared.bump()
            cheer(feeling == .bien ? .celebrate : .love, "¡Anotado!")
        } catch {
            self.error = error.localizedDescription
            cheer(.oops, "No pude guardarlo")
        }
        sending = nil
    }
}

extension View {
    /// Se quita deslizándola a la izquierda o a la derecha (como una notificación), sin estorbar el scroll vertical.
    func swipeToDismiss(_ onDismiss: @escaping () -> Void) -> some View {
        modifier(SwipeToDismiss(onDismiss: onDismiss))
    }
}

private struct SwipeToDismiss: ViewModifier {
    let onDismiss: () -> Void
    @State private var offset: CGFloat = 0
    @State private var horizontal: Bool?

    func body(content: Content) -> some View {
        content
            .offset(x: offset)
            .opacity(1 - min(abs(offset) / 320, 0.6))
            .simultaneousGesture(
                DragGesture(minimumDistance: 16)
                    .onChanged { value in
                        if horizontal == nil { horizontal = abs(value.translation.width) > abs(value.translation.height) }
                        if horizontal == true { offset = value.translation.width }
                    }
                    .onEnded { value in
                        defer { horizontal = nil }
                        guard horizontal == true else { return }
                        let dx = value.translation.width + (value.predictedEndTranslation.width - value.translation.width) * 0.3
                        if abs(dx) > 110 {
                            withAnimation(.easeOut(duration: 0.2)) { offset = dx > 0 ? 600 : -600 }
                            Task {
                                try? await Task.sleep(for: .milliseconds(200))
                                onDismiss()
                            }
                        } else {
                            withAnimation(.spring(duration: 0.3)) { offset = 0 }
                        }
                    }
            )
            .accessibilityAction(named: "Quitar", onDismiss)
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
    /// false = texto en tercera persona (la nutrióloga viendo a su paciente).
    var own = true

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
            SectionTitle(own ? "Tus patrones" : "Sus patrones")
            if let timing {
                line("🌅", "Primera comida a las **\(Fmt.time(timing.first))** y última a las **\(Fmt.time(timing.last))**, en promedio.")
                if let longest = timing.longest, longest.minutes >= 60 {
                    let day = Self.weekdays[Fmt.calendar.component(.weekday, from: longest.from) - 1]
                    line("⏳", "\(own ? "Lo más que pasaste" : "Lo más que pasó") sin comer en el día: **\(TimingStats.duration(longest.minutes))** (el \(day) desde las \(Fmt.time(longest.from))).")
                }
                if timing.late > 0 {
                    line("🌙", "**\(timing.late)** \(timing.late == 1 ? "comida" : "comidas") después de las 9 de la noche.")
                }
            }
            if let feel, let first = feel.top.first {
                line(first.0.emoji, "\(own ? "Lo que más sentiste" : "Lo que más sintió"): " + feel.top.map { "**\($0.0.label.lowercased())** (\($0.1))" }.joined(separator: ", ") + ".")
                if feel.energy != nil || feel.onPlan != nil {
                    let energy = feel.energy.map { "Energía promedio **\(String(format: "%.1f", $0))/5**. " } ?? ""
                    let plan = feel.onPlan.map { "Con \(own ? "tu" : "su") plan **\($0.yes)** de \($0.total) \($0.total == 1 ? "vez" : "veces")." } ?? ""
                    line("⚡️", energy + plan)
                }
            } else {
                line("💬", own ? "Registra cómo te sientes en Mi día para ver aquí tus patrones de ánimo." : "Aún no registra cómo se siente esta semana.", muted: true)
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
                        if busy { ProgressView() } else { Label(own ? "Que Avo encuentre mis patrones" : "Que Avo encuentre sus patrones", systemImage: "sparkles") }
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
