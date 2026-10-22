import SwiftUI

/// Detalle de una comida: foto, análisis con porciones, corrección con palabras y comentarios con la nutrióloga.
struct MealDetailView: View {
    let mealId: String

    @Environment(Session.self) private var session
    @Environment(Outbox.self) private var outbox
    @Environment(Connectivity.self) private var connectivity
    @Environment(\.dismiss) private var dismiss
    @State private var meal: Meal?
    @State private var notFound = false
    @State private var loadError: String?
    @State private var comment = ""
    @State private var sendingComment = false
    @State private var correction = ""
    @State private var correcting = false
    @State private var correctError: String?
    @State private var retrying = false
    @State private var confirmDelete = false
    @State private var alert: String?
    // Porciones: cada toque se ve al instante y se guarda medio segundo después del último.
    @State private var savingPortions = false
    @State private var portionsTask: Task<Void, Never>?
    @State private var confirmed: Meal?
    @State private var viewingPhoto = false

    private let api = APIClient.shared
    private var job: MealJob? { outbox.jobs.first { $0.id == mealId } }
    private var isOwner: Bool { job != nil || meal?.userId == session.user?.id }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let job {
                    queued(job)
                } else if let meal {
                    content(meal)
                } else if notFound {
                    VStack(spacing: 8) {
                        Text("No encontramos esta comida").font(.headline)
                        Text("Puede que la hayan borrado o que ya no tengas acceso.").foregroundStyle(Theme.muted)
                    }
                    .frame(maxWidth: .infinity)
                    .card(padding: 24)
                } else if let loadError {
                    Notice(text: loadError, tone: .warning)
                } else {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 80)
                }
            }
            .padding(.horizontal, Theme.gutter)
            .padding(.bottom, 32)
        }
        .scrollDismissesKeyboard(.interactively)
        .screenBackground()
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if isOwner && (job != nil || meal != nil) {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button("Borrar comida", systemImage: "trash", role: .destructive) { confirmDelete = true }
                    } label: {
                        Image(systemName: "ellipsis")
                    }
                    .accessibilityLabel("Más opciones")
                }
            }
        }
        .confirmationDialog("¿Borrar esta comida?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Borrar comida", role: .destructive) { Task { await remove() } }
        } message: {
            Text("Se borran la foto, el análisis y los comentarios.")
        }
        .fullScreenCover(isPresented: $viewingPhoto) {
            if let job {
                PhotoViewer(image: outbox.photo(job.id), canSave: true)
            } else if let meal {
                PhotoViewer(url: meal.photoUrl, canSave: isOwner)
            }
        }
        .alert(alert ?? "", isPresented: Binding(get: { alert != nil }, set: { if !$0 { alert = nil } })) {
            Button("OK", role: .cancel) {}
        }
        // Rápido mientras la IA analiza; después, cada 15 s para ver comentarios nuevos.
        .task(id: job == nil) {
            guard job == nil else { return }
            while !Task.isCancelled {
                await load()
                try? await Task.sleep(for: .seconds(meal?.status == .pending ? 4 : 15))
            }
        }
    }

    // MARK: - Comida que sigue en el teléfono

    @ViewBuilder private func queued(_ job: MealJob) -> some View {
        Group {
            if let photo = outbox.photo(job.id) {
                Image(uiImage: photo).resizable().scaledToFill()
            } else {
                Theme.sunken
            }
        }
        .frame(height: 300)
        .frame(maxWidth: .infinity)
        .clipShape(.rect(cornerRadius: Theme.radius))
        .contentShape(.rect)
        .onTapGesture { viewingPhoto = true }
        .accessibilityAddTraits(.isButton)
        .accessibilityHint("Abre la foto en grande")

        VStack(alignment: .leading, spacing: 6) {
            Text("\(Fmt.day(job.eatenAt)) · \(Fmt.time(job.eatenAt))").font(.subheadline.weight(.semibold)).foregroundStyle(Theme.muted)
            Text("Comida guardada en el teléfono").font(.display(28, weight: 800)).foregroundStyle(Theme.ink)
            if let note = job.note { Text("“\(note)”").italic().foregroundStyle(Theme.muted) }
            if job.error != nil {
                Chip(text: "No se pudo enviar", icon: "exclamationmark.triangle", tone: .danger)
            } else if outbox.sending == job.id {
                Chip(text: "Enviando la foto…", icon: "arrow.up.circle")
            } else {
                Chip(text: connectivity.online ? "En cola para enviar" : "Se analiza en cuanto vuelva la señal", icon: "clock")
            }
        }

        if let error = job.error {
            VStack(alignment: .leading, spacing: 12) {
                Notice(text: "El servidor no aceptó esta comida: \(error)", tone: .danger)
                Button("Intentar de nuevo", systemImage: "arrow.clockwise") { outbox.retry(job.id) }.secondaryButton()
            }
            .card()
        }
    }

    // MARK: - Comida en el servidor

    @ViewBuilder private func content(_ meal: Meal) -> some View {
        let stuck = meal.status == .pending && Date.now.timeIntervalSince(Fmt.date(meal.createdAt)) > 120
        let canRetry = connectivity.online && isOwner && !retrying && (meal.status == .error || stuck)
        // Comida que llegó sin permiso para la IA: primero el permiso, luego reintentar.
        let needsConsent = isOwner && session.user?.aiConsentAt == nil && meal.status != .analyzed

        RemoteImage(url: meal.photoUrl)
            .frame(height: 300)
            .frame(maxWidth: .infinity)
            .clipShape(.rect(cornerRadius: Theme.radius))
            .contentShape(.rect)
            .onTapGesture { viewingPhoto = true }
            .accessibilityAddTraits(.isButton)
            .accessibilityHint("Abre la foto en grande")

        VStack(alignment: .leading, spacing: 6) {
            Text("\(Fmt.day(meal.eatenDate)) · \(Fmt.time(meal.eatenDate)) · \(meal.kind.label)")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Theme.muted)
            Text(meal.title).font(.display(28, weight: 800)).foregroundStyle(Theme.ink)
            if let note = meal.note, !note.isEmpty { Text("“\(note)”").italic().foregroundStyle(Theme.muted) }
            if let cooking = meal.cooking, !cooking.isEmpty { Text("🍳 \(cooking)").font(.subheadline).foregroundStyle(Theme.muted) }
            if meal.status == .pending { Chip(text: "La IA está analizando la foto", icon: "clock") }
        }

        if meal.status == .error || canRetry {
            VStack(alignment: .leading, spacing: 12) {
                if meal.status == .error {
                    Notice(text: "No se pudo analizar la foto." + (meal.analysis?.error.map { " Detalle: \($0)" } ?? ""), tone: .danger)
                }
                if stuck { Text("El análisis está tardando más de lo normal.").font(.subheadline).foregroundStyle(Theme.muted) }
                if canRetry && !needsConsent {
                    Button("Reintentar análisis", systemImage: "arrow.clockwise") { Task { await retry() } }.secondaryButton()
                }
            }
            .card()
        }

        if needsConsent { AiConsentView() }

        if meal.status == .analyzed, isOwner, let note = meal.analysis?.avo, !note.text.isEmpty {
            AvoSaysCard(note: note)
        }

        if meal.status == .analyzed {
            PortionsCard(
                meal: meal,
                editable: isOwner,
                enabled: connectivity.online && !correcting,
                saving: savingPortions,
                onChange: setEaten
            )
        }

        if meal.status == .analyzed && isOwner { ShareStickerCard(meal: meal) }

        if meal.status == .analyzed && isOwner {
            VStack(alignment: .leading, spacing: 10) {
                Text("¿Algo no cuadra? Cuéntalo con tus palabras").font(.subheadline.weight(.semibold))
                TextField("Ej. me dejé la mitad de la ensalada y me tomé todo el jugo", text: $correction, axis: .vertical)
                    .lineLimit(2...4)
                    .padding(12)
                    .background(Theme.sunken, in: .rect(cornerRadius: 14))
                Text("La IA ajusta los alimentos y las porciones; no vuelve a mandar la foto.").font(.footnote).foregroundStyle(Theme.muted)
                if let correctError { Notice(text: correctError, tone: .danger) }
                Button {
                    Task { await correct() }
                } label: {
                    Group {
                        if correcting { ProgressView() } else { Label(connectivity.online ? "Corregir" : "Corregir (sin conexión)", systemImage: "wand.and.stars") }
                    }
                    .frame(maxWidth: .infinity)
                }
                .secondaryButton()
                .disabled(correction.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !connectivity.online || savingPortions || correcting)
            }
            .card()
        }

        if isOwner { MoodCheckInView(mealId: meal.id, title: "¿Cómo te sentiste después de comer?") }

        comments(meal)
    }

    @ViewBuilder private func comments(_ meal: Meal) -> some View {
        SectionTitle("Indicaciones y comentarios")
        let list = meal.comments ?? []
        if list.isEmpty {
            Text("Aún no hay comentarios.").font(.subheadline).foregroundStyle(Theme.muted)
        }
        ForEach(list) { c in
            CommentBubble(author: c.authorName ?? "Sin nombre", role: c.authorRole, time: Fmt.ago(c.createdAt), text: c.body)
        }
        HStack(alignment: .bottom, spacing: 8) {
            TextField("Escribe un comentario", text: $comment, axis: .vertical)
                .lineLimit(1...4)
                .padding(12)
                .background(Theme.surface, in: .rect(cornerRadius: 18))
            Button {
                Task { await sendComment() }
            } label: {
                Image(systemName: "paperplane.fill").frame(width: 22, height: 22)
            }
            .buttonStyle(.borderedProminent)
            .buttonBorderShape(.circle)
            .controlSize(.large)
            .disabled(comment.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || sendingComment)
            .accessibilityLabel("Enviar comentario")
        }
    }

    // MARK: - Acciones

    private func load() async {
        // No pisar lo que el paciente está cambiando.
        guard !savingPortions, !correcting, !retrying else { return }
        do {
            let fresh: Meal = try await api.request("GET", "/meals/\(mealId)")
            guard !savingPortions, !correcting, !retrying else { return }
            if let before = meal, before.status == .pending, fresh.userId == session.user?.id {
                if fresh.status == .analyzed { cheer(.celebrate, fresh.analyzedLine(own: true)) }
                if fresh.status == .error { cheer(.oops, "No pude analizarla") }
            }
            meal = fresh
            loadError = nil
        } catch let error as APIError where error.status == 404 {
            notFound = true
        } catch is CancellationError {
        } catch {
            loadError = connectivity.online ? error.localizedDescription : "Sin conexión. Esta comida no está guardada en el teléfono."
        }
    }

    /// Junta la comida que regresa la API con los comentarios que ya teníamos.
    private func apply(_ updated: Meal) {
        var next = updated
        next.comments = meal?.comments
        meal = next
    }

    private func setEaten(_ index: Int, _ value: Double) {
        guard let current = meal, var items = current.analysis?.items, items.indices.contains(index) else { return }
        if confirmed == nil { confirmed = current }
        items[index].eaten = value
        var updated = current.with(items: items)
        updated.comments = current.comments
        meal = updated
        savingPortions = true
        let reactions: [Double: (Mood, String)] = [1: (.love, "¡Todo!"), 0.75: (.eat, "¡Casi todo!"), 0.5: (.eat, "La mitad, anotado"), 0.25: (.eat, "Solo un poquito"), 0: (.oops, "¿Nada de nada?")]
        let (mood, message) = reactions[value] ?? (.eat, "Anotado")
        cheer(mood, message)
        portionsTask?.cancel()
        portionsTask = Task {
            try? await Task.sleep(for: .milliseconds(500))
            guard !Task.isCancelled else { return }
            await savePortions()
        }
    }

    private func savePortions() async {
        guard let items = meal?.analysis?.items else { return }
        let eaten = items.map(\.eatenFraction)
        do {
            let saved: Meal = try await api.request("PATCH", "/meals/\(mealId)/portions", json: ["eaten": eaten, "items": items.map(\.name)])
            // Si hubo más toques mientras se guardaba, se respetan los de la pantalla y se guardan después.
            guard meal?.analysis?.items?.map(\.eatenFraction) == eaten else { return }
            apply(saved)
            confirmed = nil
            savingPortions = false
        } catch {
            if let confirmed { meal = confirmed }
            confirmed = nil
            savingPortions = false
            cheer(.oops, "No se guardó")
            alert = error.localizedDescription
            if (error as? APIError)?.status == 409 { await load() }
        }
    }

    private func correct() async {
        let text = correction.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        correcting = true
        correctError = nil
        cheer(.think, "Déjame ajustarla…")
        do {
            let updated: Meal = try await api.request("POST", "/meals/\(mealId)/correct", json: ["text": text], timeout: 60)
            apply(updated)
            correction = ""
            cheer(.celebrate, "¡Gracias por avisarme! Ya lo ajusté 👍")
        } catch {
            correctError = error.localizedDescription
            cheer(.oops, "No pude corregirla")
        }
        correcting = false
        if (correctError != nil) { await load() }
    }

    private func retry() async {
        retrying = true
        cheer(.think, "Lo intento otra vez…")
        let previous = meal?.status
        meal?.status = .pending
        do {
            let updated: Meal = try await api.request("POST", "/meals/\(mealId)/analyze", query: ["offset": String(Fmt.timezoneOffset)], timeout: 90)
            apply(updated)
        } catch {
            if let previous { meal?.status = previous }
            alert = error.localizedDescription
        }
        retrying = false
    }

    private func sendComment() async {
        let text = comment.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        sendingComment = true
        do {
            let created: MealComment = try await api.request(
                "POST", "/meals/\(mealId)/comments", json: ["id": UUID().uuidString.lowercased(), "body": text]
            )
            meal?.comments = (meal?.comments ?? []) + [created]
            comment = ""
            cheer(.love, "¡Comentario enviado!")
        } catch {
            alert = error.localizedDescription
        }
        sendingComment = false
    }

    private func remove() async {
        do {
            if let job {
                outbox.discard(job.id)
            } else {
                let _: OKResponse = try await api.request("DELETE", "/meals/\(mealId)")
            }
            cheer(.oops, "Comida borrada")
            dismiss()
        } catch {
            alert = error.localizedDescription
        }
    }
}

/// Lo que se comió: totales y, por cada alimento, cuánto (Todo · ¾ · ½ · ¼ · Nada).
struct PortionsCard: View {
    let meal: Meal
    let editable: Bool
    let enabled: Bool
    let saving: Bool
    let onChange: (Int, Double) -> Void

    var body: some View {
        let a = meal.analysis
        let items = a?.items ?? []
        let consumed = meal.consumed
        let served = a?.served ?? consumed
        let leftover = served.calories - consumed.calories >= 1
        let percent = served.calories > 0 ? Int((consumed.calories / served.calories * 100).rounded()) : 100

        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .top) {
                cell(Fmt.number(consumed.calories), "kcal")
                cell(Fmt.grams(consumed.proteinG), "proteína")
                cell(Fmt.grams(consumed.carbsG), "carbs")
                cell(Fmt.grams(consumed.fatG), "grasa")
            }

            if leftover {
                Text("\(editable ? "Comiste" : "Comió") **\(percent) %** de lo servido (\(Fmt.kcal(served.calories))).")
                    .font(.subheadline)
                    .foregroundStyle(Theme.ink)
            }

            if items.isEmpty, let summary = a?.summary {
                Text(summary).font(.subheadline).foregroundStyle(Theme.muted)
            }

            ForEach(Array(items.enumerated()), id: \.offset) { index, item in
                let f = item.eatenFraction
                VStack(alignment: .leading, spacing: 8) {
                    HStack(alignment: .firstTextBaseline) {
                        Text("\(Text(item.name).fontWeight(.semibold)) \(Text("· \(Fmt.grams(item.portionG))").foregroundStyle(Theme.muted))").font(.subheadline)
                        Spacer(minLength: 8)
                        Text(f < 1 ? "\(Fmt.number(item.calories * f)) de \(Fmt.kcal(item.calories))" : Fmt.kcal(item.calories))
                            .font(.subheadline)
                            .foregroundStyle(Theme.muted)
                            .monospacedDigit()
                    }
                    if editable {
                        FractionPicker(
                            label: "Cuánto comiste de \(item.name)",
                            value: Binding(get: { f }, set: { onChange(index, $0) })
                        )
                        .disabled(!enabled)
                    } else if f < 1 {
                        Chip(text: "Comió \(FractionPicker.spoken(f).lowercased())")
                    }
                }
                if index < items.count - 1 { Divider() }
            }

            if editable && !enabled && !saving {
                Text("Sin conexión: podrás ajustar las porciones cuando vuelva la señal.").font(.footnote).foregroundStyle(Theme.muted)
            }
            if saving { Text("Guardando…").font(.footnote).foregroundStyle(Theme.muted) }

            FinePrint(
                "Estimación con IA\(a?.confidence.map { " (confianza \(Int(($0 * 100).rounded())) %)" } ?? ""): puede equivocarse y no es consejo médico. Sigue las indicaciones de tu nutrióloga."
                    + (a?.correction.map { " Corregida con: “\($0)”." } ?? "")
            )
        }
        .card()
    }

    private func cell(_ value: String, _ label: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value).font(.display(22, relativeTo: .title3)).foregroundStyle(Theme.ink).contentTransition(.numericText())
            Text(label).font(.caption.weight(.semibold)).foregroundStyle(Theme.muted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

/// "Avo dice": lo que Avo opina de esta foto, con su GIF. Solo lo ve el paciente.
struct AvoSaysCard: View {
    let note: AvoNote

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            MascotView(mood: .love, size: 48, pose: 0)
            VStack(alignment: .leading, spacing: 8) {
                Text("Avo dice").font(.subheadline.weight(.semibold)).foregroundStyle(Theme.accentStrong)
                Text(note.text).font(.body).foregroundStyle(Theme.ink)
                if let gif = note.gif { GifView(gif: gif) }
            }
            Spacer(minLength: 0)
        }
        .card()
        .accessibilityElement(children: .contain)
    }
}
