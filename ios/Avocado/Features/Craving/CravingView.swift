import SwiftUI
import UIKit

/**
 "¿Me lo como?": foto de un antojo → Avo dice cuántas calorías tiene y cuánto conviene comer según lo que lleva
 hoy, su meta y la hora. No se registra; si al final se lo come, lo registra con un toque.
 */
struct CravingView: View {
    @Environment(Session.self) private var session
    @Environment(Outbox.self) private var outbox
    @Environment(Connectivity.self) private var connectivity
    @Environment(StreakStore.self) private var streaks
    @Environment(\.dismiss) private var dismiss
    @State private var photo: UIImage?
    @State private var note = ""
    @State private var busy = false
    @State private var error: String?
    @State private var result: Craving?
    @State private var answer = ""
    @State private var portion = 0.5

    private static let verdicts: [String: (Mood, String)] = [
        "adelante": (.celebrate, "¡Date el gusto!"),
        "un_poco": (.eat, "Sí, una porción pequeña"),
        "compartelo": (.love, "Mejor compártelo"),
        "mejor_no": (.think, "Hoy, solo una probadita"),
    ]
    private static let portionText: [Double: String] = [1: "todo", 0.75: "tres cuartos", 0.5: "la mitad", 0.25: "un cuarto"]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if session.user?.aiConsentAt == nil {
                    AiConsentView(onDecline: { dismiss() })
                } else if let result {
                    advice(result)
                } else {
                    ask
                }
            }
            .padding(.horizontal, Theme.gutter)
            .padding(.bottom, 32)
        }
        .scrollDismissesKeyboard(.interactively)
        .screenBackground()
        .navigationTitle("¿Me lo como?")
        .navigationBarTitleDisplayMode(.inline)
    }

    @ViewBuilder private var ask: some View {
        Text("Tómale foto a tu antojo y Avo te dice cuántas calorías tiene y cuánto te conviene. No se registra en tu día.")
            .font(.body)
            .foregroundStyle(Theme.ink)
        PhotoField(photo: $photo, prompt: "Agrega una foto de tu antojo") { cheer(.eat, "¡Mmm! ¿Qué tenemos aquí?") }
        VStack(alignment: .leading, spacing: 8) {
            Text("¿Qué es? (opcional)").font(.subheadline.weight(.semibold))
            TextField("Ej. pastel de tres leches, una dona glaseada…", text: $note)
                .padding(12)
                .background(Theme.sunken, in: .rect(cornerRadius: 14))
        }
        .card()
        if !connectivity.online { Notice(text: "Sin conexión: Avo necesita internet para ver tu antojo.", tone: .warning) }
        if let error { Notice(text: error, tone: .danger) }
        Button {
            Task { await send() }
        } label: {
            Group {
                if busy { ProgressView().tint(.white) } else { Label("Preguntarle a Avo", systemImage: "bubble.left.fill") }
            }
            .font(.headline)
            .frame(maxWidth: .infinity)
        }
        .primaryButton()
        .disabled(photo == nil || busy || !connectivity.online)
    }

    @ViewBuilder private func advice(_ c: Craving) -> some View {
        let (mood, title) = c.isNotFood ? (.think, "Mmm… ¿qué es?") : Self.verdicts[c.verdict] ?? (.eat, "Sí, una porción pequeña")

        if let photo {
            Image(uiImage: photo).resizable().scaledToFill()
                .frame(height: 240).frame(maxWidth: .infinity)
                .clipShape(.rect(cornerRadius: Theme.radius))
        }

        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 12) {
                MascotView(mood: mood, size: 96, hd: true)
                VStack(alignment: .leading, spacing: 2) {
                    if !c.name.isEmpty {
                        Text(c.name + (c.portionG > 0 ? " · \(Fmt.grams(c.portionG))" : ""))
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(Theme.muted)
                    }
                    Text(title).font(.display(26, weight: 800)).foregroundStyle(Theme.ink)
                }
            }

            if !c.isNotFood {
                HStack {
                    number(Fmt.number(c.calories), "kcal completo")
                    number(Fmt.number(c.suggestedCalories), "kcal · \(Self.fractionLabel(c.suggestedFraction).lowercased())", highlight: true)
                }
                if c.today.pending > 0 {
                    Notice(
                        text: (c.today.pending == 1 ? "Tienes 1 comida de hoy que aún no se cuenta" : "Tienes \(c.today.pending) comidas de hoy que aún no se cuentan")
                            + " (se está analizando o no tiene análisis): en realidad llevas más.",
                        tone: .warning
                    )
                }
                if let goal = c.today.goal {
                    CravingMeter(consumed: c.today.consumed, add: c.suggestedCalories, goal: goal, approx: c.today.pending > 0)
                } else {
                    Text("Hoy llevas **\(Fmt.kcal(c.today.consumed))**. Pon tu meta diaria en Perfil y Avo te aconseja con más precisión.")
                        .font(.subheadline)
                }
            }

            Text(c.message).font(.body).foregroundStyle(Theme.ink)
            if !c.tips.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(c.tips, id: \.self) { tip in
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            Image(systemName: "leaf.fill").font(.caption).foregroundStyle(Theme.accent)
                            Text(tip).font(.subheadline)
                        }
                    }
                }
            }

            if let question = c.question {
                VStack(alignment: .leading, spacing: 8) {
                    Text("**Avo pregunta:** \(question)").font(.subheadline)
                    HStack {
                        TextField("Tu respuesta", text: $answer)
                            .padding(12)
                            .background(Theme.sunken, in: .rect(cornerRadius: 14))
                        Button("Responder") { Task { await send(followUp: (question, answer)) } }
                            .buttonStyle(.borderedProminent)
                            .disabled(answer.trimmingCharacters(in: .whitespaces).isEmpty || busy || !connectivity.online)
                    }
                }
            }
            if let error { Notice(text: error, tone: .danger) }
            FinePrint("Estimación con IA: puede equivocarse y no es consejo médico. No se registró en tu día.")
        }
        .card()

        if !c.isNotFood {
            VStack(alignment: .leading, spacing: 12) {
                SectionTitle("¿Te lo comiste?")
                FractionPicker(label: "Cuánto te comiste", options: FractionPicker.eating, value: $portion)
                Button { register(c) } label: {
                    Label("Registrar \(Self.portionText[portion] ?? "") en mi día", systemImage: "checkmark").frame(maxWidth: .infinity)
                }
                .primaryButton()
            }
            .card()
        }

        Button("Preguntar por otro antojo", systemImage: "camera") {
            result = nil
            photo = nil
            note = ""
            answer = ""
            error = nil
        }
        .frame(maxWidth: .infinity)
        .disabled(busy)
    }

    private func number(_ value: String, _ label: String, highlight: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value).font(.display(28, weight: 800)).foregroundStyle(highlight ? Theme.accent : Theme.ink)
            Text(label).font(.caption.weight(.semibold)).foregroundStyle(Theme.muted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// "La mitad", "¾", "Unas probadas"… para la fracción que recomienda Avo.
    static func fractionLabel(_ f: Double) -> String {
        if f >= 0.99 { return "Todo" }
        if f <= 0.15 { return "Unas probadas" }
        switch (f * 100).rounded() / 100 {
        case 0.75: return "¾"
        case 0.5: return "La mitad"
        case 0.25: return "¼"
        case 0.33: return "⅓"
        default: return "\(Int((f * 100).rounded())) %"
        }
    }

    private func send(followUp: (String, String)? = nil) async {
        guard let photo, let jpeg = ImageTools.jpeg(photo) else { return }
        busy = true
        error = nil
        let day = Fmt.startOfDay(.now)
        let next = Fmt.addDays(day, 1)
        // Comidas de hoy que siguen en el teléfono: el servidor aún no las conoce.
        let queued = outbox.jobs.filter { $0.userId == session.user?.id && $0.eatenAt >= day && $0.eatenAt < next }.count
        var form = MultipartForm()
        form.addJPEG("photo", filename: "antojo.jpg", data: jpeg)
        form.add("from", Fmt.iso(day))
        form.add("to", Fmt.iso(next))
        form.add("hour", String(Fmt.calendar.component(.hour, from: .now)))
        form.add("queued", String(queued))
        let trimmed = note.trimmingCharacters(in: .whitespaces)
        if !trimmed.isEmpty { form.add("note", trimmed) }
        if let followUp {
            form.add("question", followUp.0)
            form.add("answer", followUp.1.trimmingCharacters(in: .whitespaces))
        }
        do {
            let advice: Craving = try await APIClient.shared.request("POST", "/cravings", form: form, timeout: 90)
            result = advice
            answer = ""
            portion = [1, 0.75, 0.5, 0.25].min { abs($0 - advice.suggestedFraction) < abs($1 - advice.suggestedFraction) } ?? 0.5
        } catch {
            self.error = (error as? APIError)?.status == 0 && connectivity.online ? "Avo tardó demasiado en contestar. Intenta de nuevo." : error.localizedDescription
            cheer(.oops, "No pude verlo bien")
        }
        busy = false
    }

    private func register(_ c: Craving) {
        guard let photo, let user = session.user, let jpeg = ImageTools.jpeg(photo) else { return }
        let what = c.name.isEmpty ? "" : " (\(c.name))"
        let job = MealJob(
            id: UUID().uuidString.lowercased(), userId: user.id, eatenAt: .now,
            note: "Antojo\(what): me comí \(Self.portionText[portion] ?? "una parte").", createdAt: .now
        )
        do {
            try outbox.enqueue(job, jpeg: jpeg)
        } catch {
            self.error = "No pude guardar la foto en el teléfono"
            return
        }
        let name = Fmt.firstName(user.fullName)
        CelebrationCenter.shared.show(CelebrationInfo(
            title: "¡Antojo registrado!",
            message: "Te diste el gusto con cabeza\(name.isEmpty ? "" : ", \(name)"). ¡Disfrútalo!",
            photo: photo,
            streak: streaks.afterNewMealToday()
        ))
        dismiss()
    }
}

/// Barra del día: lo que llevas, lo que sumaría el antojo y dónde está tu meta.
struct CravingMeter: View {
    let consumed: Double
    let add: Double
    let goal: Double
    let approx: Bool

    var body: some View {
        let after = consumed + add
        let scale = max(goal, after) * 1.04
        let left = goal - after
        VStack(alignment: .leading, spacing: 8) {
            GeometryReader { geo in
                let w = geo.size.width
                ZStack(alignment: .leading) {
                    Capsule().fill(Theme.sunken)
                    Capsule().fill(Theme.accent).frame(width: min(w, w * consumed / scale))
                    Rectangle().fill(Theme.orange).frame(width: min(w, w * add / scale)).offset(x: min(w, w * consumed / scale))
                    Rectangle().fill(Theme.ink).frame(width: 2, height: 22).offset(x: min(w - 2, w * goal / scale))
                }
                .clipShape(.capsule)
            }
            .frame(height: 16)
            HStack(spacing: 12) {
                legend(Theme.accent, "Llevas \(Fmt.number(consumed))")
                legend(Theme.orange, "+\(Fmt.number(add))")
                Spacer()
                Text("Meta \(Fmt.number(goal))").font(.caption.weight(.semibold)).foregroundStyle(Theme.muted)
            }
            Text(left >= 0
                ? "Te quedarían \(approx ? "como máximo " : "")**\(Fmt.kcal(left))** para el resto del día."
                : "Te pasarías **\(Fmt.kcal(-left))** de tu meta.")
                .font(.subheadline)
        }
        .accessibilityElement(children: .combine)
    }

    private func legend(_ color: Color, _ text: String) -> some View {
        HStack(spacing: 4) {
            Circle().fill(color).frame(width: 8, height: 8)
            Text(text).font(.caption.weight(.semibold)).foregroundStyle(Theme.muted)
        }
    }
}
