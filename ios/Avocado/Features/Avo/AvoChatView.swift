import SwiftUI

/**
 Platicar con Avo: por texto o con audios (como en WhatsApp). Avo contesta con la hora, tus comidas y cómo te has
 sentido, y si le cuentas cómo te sientes lo anota (eso lo ve tu nutrióloga; la conversación es privada).
 */
struct AvoChatView: View {
    /// Un mensaje que todavía no llega (se muestra mientras Avo contesta, o con error para reintentar).
    private struct Pending: Equatable {
        let id: String
        let text: String
        let audio: Data?
        var error: String?
    }

    private static let maxSeconds = 90.0
    private static let suggestions = ["Tengo hambre", "Me siento ansioso/a", "No me llené con la comida", "¿Qué ceno hoy?"]

    @Environment(Session.self) private var session
    @Environment(Connectivity.self) private var connectivity
    @State private var messages: [AvoMessage]?
    @State private var loadError: String?
    @State private var pending: Pending?
    @State private var text = ""
    @State private var recorder = AudioRecorder()
    @State private var micError: String?
    @State private var confirmClear = false
    @FocusState private var typing: Bool

    private var busy: Bool { pending != nil && pending?.error == nil }
    private var name: String { Fmt.firstName(session.user?.fullName) }

    var body: some View {
        Group {
            if session.user?.aiConsentAt == nil {
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        header
                        AiConsentView()
                    }
                    .padding(.horizontal, Theme.gutter)
                }
            } else {
                chat
            }
        }
        .screenBackground()
        .toolbar(.hidden, for: .navigationBar)
        .task(id: session.user?.aiConsentAt) { await load() }
        .confirmationDialog("¿Borrar la conversación con Avo?", isPresented: $confirmClear, titleVisibility: .visible) {
            Button("Borrar conversación", role: .destructive) { Task { await clear() } }
        } message: {
            Text("Lo que Avo anotó de cómo te sentías se queda en tu día.")
        }
    }

    private var header: some View {
        HStack(spacing: 14) {
            MascotView(mood: busy ? .think : .idle, size: 64, reactive: true, bubbleEdge: .bottom)
            VStack(alignment: .leading, spacing: 2) {
                Text("Avo").font(.display(30, weight: 800, relativeTo: .largeTitle))
                Text("Lo que platiquen es privado; cómo te sientes lo ve tu nutrióloga.")
                    .font(.footnote)
                    .foregroundStyle(Theme.muted)
            }
            Spacer(minLength: 0)
            if messages?.isEmpty == false {
                Menu {
                    Button("Borrar conversación", systemImage: "trash", role: .destructive) { confirmClear = true }
                } label: {
                    Image(systemName: "ellipsis.circle").font(.title3)
                }
                .accessibilityLabel("Más opciones")
            }
        }
        .padding(.top, 8)
    }

    private var chat: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 10) {
                    header
                    if let loadError { Notice(text: loadError, tone: .warning) }
                    if messages == nil && loadError == nil { ProgressView().frame(maxWidth: .infinity).padding(.top, 40) }
                    if messages?.isEmpty == true {
                        bubble(
                            "¡Hola\(name.isEmpty ? "" : ", \(name)")! Cuéntame cómo te sientes, qué se te antoja o cómo te fue con tu última comida. Puedes escribirme o mandarme un audio 🎙️",
                            mine: false
                        )
                        if pending == nil {
                            FlowLayout(spacing: 8) {
                                ForEach(Self.suggestions, id: \.self) { s in
                                    Button(s) { send(Pending(id: UUID().uuidString.lowercased(), text: s, audio: nil)) }
                                        .font(.subheadline.weight(.semibold))
                                        .buttonStyle(.bordered)
                                        .buttonBorderShape(.capsule)
                                        .disabled(!connectivity.online)
                                }
                            }
                        }
                    }
                    ForEach(messages ?? []) { m in
                        messageView(m).id(m.id)
                    }
                    if let pending {
                        VStack(alignment: .trailing, spacing: 4) {
                            bubble(pending.audio != nil ? "🎙️ Audio" : pending.text, mine: true).opacity(0.75)
                            if let error = pending.error {
                                HStack(spacing: 6) {
                                    Text(error).font(.footnote).foregroundStyle(Theme.danger)
                                    Button("Reintentar") { send(pending) }.font(.footnote.weight(.semibold))
                                }
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .trailing)
                    }
                    if busy { TypingBubble() }
                    if let micError { Notice(text: micError, tone: .danger) }
                    if !connectivity.online { Notice(text: "Sin conexión: Avo necesita internet para platicar.", tone: .warning) }
                    Color.clear.frame(height: 1).id("fin")
                }
                .padding(.horizontal, Theme.gutter)
                .padding(.bottom, 12)
            }
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: messages?.count) { withAnimation { proxy.scrollTo("fin", anchor: .bottom) } }
            .onChange(of: pending) { withAnimation { proxy.scrollTo("fin", anchor: .bottom) } }
            .safeAreaInset(edge: .bottom) { composer.padding(.horizontal, Theme.gutter).padding(.vertical, 8).background(Theme.ground) }
        }
    }

    @ViewBuilder private func messageView(_ m: AvoMessage) -> some View {
        let mine = m.role == .user
        VStack(alignment: mine ? .trailing : .leading, spacing: 4) {
            bubble(m.body, mine: mine, audio: m.viaAudio)
            if let mood = m.mood {
                Text("Anoté: " + mood.feelings.map { "\($0.emoji) \($0.label)" }.joined(separator: " · ") + (mood.energy.map { " · Energía \($0)/5" } ?? ""))
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Theme.accentStrong)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
                    .background(Theme.accentSoft, in: .capsule)
            }
            Text(Fmt.time(Fmt.date(m.createdAt))).font(.caption2).foregroundStyle(Theme.muted)
        }
        .frame(maxWidth: .infinity, alignment: mine ? .trailing : .leading)
    }

    private func bubble(_ text: String, mine: Bool, audio: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            if audio { Text("🎙️ Audio").font(.caption.weight(.semibold)).opacity(0.85) }
            Text(text).font(.body)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .foregroundStyle(mine ? .white : Theme.ink)
        .background(mine ? Theme.accent : Theme.surface, in: UnevenRoundedRectangle(
            topLeadingRadius: 20, bottomLeadingRadius: mine ? 20 : 6, bottomTrailingRadius: mine ? 6 : 20, topTrailingRadius: 20
        ))
        .frame(maxWidth: 320, alignment: mine ? .trailing : .leading)
        .accessibilityLabel(mine ? "Tú: \(text)" : "Avo: \(text)")
    }

    @ViewBuilder private var composer: some View {
        if recorder.isRecording {
            HStack(spacing: 12) {
                Circle().fill(Theme.danger).frame(width: 12, height: 12).symbolEffect(.pulse)
                TimelineView(.periodic(from: .now, by: 1)) { context in
                    let seconds = Int(context.date.timeIntervalSince(recorder.startedAt ?? .now))
                    Text("Grabando… \(seconds / 60):\(String(format: "%02d", seconds % 60))")
                        .font(.body.weight(.semibold))
                        .monospacedDigit()
                        .onChange(of: seconds) { if Double(seconds) >= Self.maxSeconds { finishRecording() } }
                }
                Spacer()
                Button("Cancelar") { recorder.cancel() }
                Button(action: finishRecording) {
                    Image(systemName: "arrow.up").font(.headline).frame(width: 24, height: 24)
                }
                .buttonStyle(.borderedProminent)
                .buttonBorderShape(.circle)
                .controlSize(.large)
                .accessibilityLabel("Enviar audio")
            }
            .padding(.vertical, 4)
            .sensoryFeedback(.start, trigger: recorder.isRecording)
        } else {
            HStack(alignment: .bottom, spacing: 8) {
                TextField("Escríbele a Avo…", text: $text, axis: .vertical)
                    .lineLimit(1...5)
                    .focused($typing)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                    .background(Theme.surface, in: .rect(cornerRadius: 24))
                    .disabled(busy)
                if text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    Button { Task { await startRecording() } } label: {
                        Image(systemName: "mic.fill").font(.headline).frame(width: 24, height: 24)
                    }
                    .buttonStyle(.bordered)
                    .buttonBorderShape(.circle)
                    .controlSize(.large)
                    .disabled(busy || !connectivity.online)
                    .accessibilityLabel("Grabar un audio")
                } else {
                    Button(action: submit) {
                        Image(systemName: "arrow.up").font(.headline).frame(width: 24, height: 24)
                    }
                    .buttonStyle(.borderedProminent)
                    .buttonBorderShape(.circle)
                    .controlSize(.large)
                    .disabled(busy || !connectivity.online)
                    .accessibilityLabel("Enviar")
                }
            }
        }
    }

    // MARK: - Acciones

    private func load() async {
        guard session.user?.aiConsentAt != nil else { return }
        struct Page: Decodable { let messages: [AvoMessage] }
        do {
            let page: Page = try await APIClient.shared.request("GET", "/avo/messages", query: ["limit": "60"])
            messages = page.messages
            loadError = nil
        } catch is CancellationError {
        } catch {
            loadError = error.localizedDescription
        }
    }

    private func submit() {
        let value = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty, !busy else { return }
        text = ""
        send(Pending(id: UUID().uuidString.lowercased(), text: value, audio: nil))
    }

    private func startRecording() async {
        micError = nil
        typing = false
        do {
            try await recorder.start()
            cheer(.love, "Te escucho…")
        } catch {
            micError = error.localizedDescription
        }
    }

    private func finishRecording() {
        guard recorder.isRecording else { return }
        do {
            let audio = try recorder.stop()
            send(Pending(id: UUID().uuidString.lowercased(), text: "", audio: audio))
        } catch {
            micError = error.localizedDescription
        }
    }

    private func send(_ message: Pending) {
        var current = message
        current.error = nil
        pending = current
        cheer(.think, "Mmm…")
        Task {
            var form = MultipartForm()
            form.add("id", message.id)
            form.add("offset", String(Fmt.timezoneOffset))
            if !message.text.isEmpty { form.add("text", message.text) }
            if let audio = message.audio { form.addFile("audio", filename: "audio.wav", mimeType: "audio/wav", data: audio) }
            do {
                let reply: AvoReply = try await APIClient.shared.request("POST", "/avo/messages", form: form, timeout: 90)
                messages = (messages ?? []) + [reply.user, reply.avo]
                pending = nil
                if reply.mood != nil {
                    MoodsSignal.shared.bump()
                    cheer(.love, "Lo anoté")
                }
            } catch {
                pending?.error = error.localizedDescription
                cheer(.oops, "No te escuché bien")
            }
        }
    }

    private func clear() async {
        let _: OKResponse? = try? await APIClient.shared.request("DELETE", "/avo/messages")
        messages = []
    }
}

/// "Avo está escribiendo…": tres puntitos.
private struct TypingBubble: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        TimelineView(.animation(paused: reduceMotion)) { context in
            let t = context.date.timeIntervalSinceReferenceDate
            HStack(spacing: 5) {
                ForEach(0..<3) { i in
                    Circle()
                        .fill(Theme.muted)
                        .frame(width: 8, height: 8)
                        .opacity(reduceMotion ? 0.6 : 0.35 + 0.65 * max(0, sin((t * 4) - Double(i) * 0.7)))
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .background(Theme.surface, in: .rect(cornerRadius: 20))
        }
        .accessibilityLabel("Avo está escribiendo")
    }
}
