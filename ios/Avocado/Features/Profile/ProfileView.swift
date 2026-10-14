import SwiftUI

/// Perfil: nombre, meta diaria, nutrióloga, permiso para la IA, privacidad, cerrar sesión y borrar la cuenta.
struct ProfileView: View {
    @Environment(Session.self) private var session
    @State private var name = ""
    @State private var goal = ""
    @State private var nutritionists: [Person] = []
    @State private var nutriEmail = ""
    @State private var busy: String?
    @State private var message: String?
    @State private var error: String?
    @State private var askConsent = false
    @State private var confirmRevoke = false
    @State private var unlinking: Person?
    @State private var inviteCode = ""
    @State private var joining: Person?
    @State private var joinCode = ""
    @State private var route = AppRoute.shared

    private let api = APIClient.shared

    var body: some View {
        Form {
            Section {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Paciente").font(.subheadline.weight(.semibold)).foregroundStyle(Theme.muted)
                        Text("Perfil").font(.display(34, weight: 800, relativeTo: .largeTitle))
                    }
                    Spacer()
                    MascotView(mood: .idle, size: 76, reactive: true, bubbleEdge: .bottom)
                }
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets(top: 0, leading: 4, bottom: 4, trailing: 4))
            }

            if let error { Section { Notice(text: error, tone: .danger) }.listRowBackground(Color.clear).listRowInsets(EdgeInsets()) }
            if let message { Section { Notice(text: message) }.listRowBackground(Color.clear).listRowInsets(EdgeInsets()) }

            Section {
                TextField("Tu nombre", text: $name).textContentType(.name)
                Button("Guardar nombre") { Task { await saveName() } }
                    .disabled(busy != nil || name.trimmingCharacters(in: .whitespaces) == (session.user?.fullName ?? ""))
            } header: {
                Text("Nombre")
            } footer: {
                Text(session.user?.email ?? "")
            }

            if let user = session.user, user.goalsSetBy != nil {
                lockedGoals(user)
            } else {
            Section {
                TextField("Ej. 1800", text: $goal).keyboardType(.numberPad)
                Button("Guardar meta") { Task { await saveGoal() } }
                    .disabled(busy != nil || goal == (session.user?.dailyKcalGoal.map(String.init) ?? ""))
            } header: {
                Text("Tu meta diaria (kcal)")
            } footer: {
                Text("La que te indicó tu nutrióloga. Avo la usa para aconsejarte con tus antojos. Déjala vacía si no tienes una.")
            }

            Section {
                Picker("Tu objetivo", selection: Binding(get: { session.user?.goal }, set: { g in if let g { Task { await setObjective(g) } } })) {
                    ForEach(Goal.allCases) { Text($0.label).tag(Optional($0)) }
                }
                .pickerStyle(.segmented)
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets())
            } header: {
                Text("Tu objetivo")
            } footer: {
                Text("Con tu meta y tu objetivo, Avo calcula tu saldo de la semana y si te alcanza para una comida libre.")
            }
            }

            Section {
                if nutritionists.isEmpty {
                    Text("Vincula a tu nutrióloga para que vea tus comidas y te deje indicaciones.").foregroundStyle(Theme.muted)
                }
                ForEach(nutritionists) { n in
                    HStack {
                        VStack(alignment: .leading) {
                            Text(n.displayName)
                            Text(n.email).font(.footnote).foregroundStyle(Theme.muted)
                        }
                        Spacer()
                        Button("Quitar", role: .destructive) { unlinking = n }.buttonStyle(.borderless)
                    }
                }
                TextField("Código de invitación", text: $inviteCode)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                Button("Unirme") { Task { await lookup(inviteCode) } }.disabled(busy != nil || inviteCode.trimmingCharacters(in: .whitespaces).isEmpty)
                TextField("Correo de tu nutrióloga", text: $nutriEmail)
                    .keyboardType(.emailAddress)
                    .textContentType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                Button("Vincular") { Task { await link() } }.disabled(busy != nil || !nutriEmail.contains("@"))
            } header: {
                Text("Mi nutrióloga")
            } footer: {
                Text("Pídele a tu nutrióloga su código de invitación, o vincúlala con su correo.")
            }

            Section {
                if let given = session.user?.aiConsentAt {
                    Text("Diste permiso \(Self.when(given)). Tus fotos y notas se mandan a modelos de Google y OpenAI (vía OpenRouter) para calcular calorías y macros.")
                        .font(.subheadline)
                    Button("Retirar permiso", role: .destructive) { confirmRevoke = true }
                } else {
                    Text("No has dado permiso: Avo no analiza tus fotos ni tus antojos.").font(.subheadline)
                    Button("Dar permiso") { askConsent = true }
                }
            } header: {
                Text("Análisis con IA")
            }

            Section {
                Link("Política de privacidad", destination: Config.privacyURL)
            }

            Section {
                AccountActions(inForm: true)
            } footer: {
                Text("Avocado \(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "")")
            }
        }
        .scrollContentBackground(.hidden)
        .screenBackground()
        .scrollDismissesKeyboard(.interactively)
        .toolbar(.hidden, for: .navigationBar)
        .sheet(isPresented: $askConsent) {
            ScrollView { AiConsentView(onDecline: { askConsent = false }).padding(Theme.gutter) }
                .screenBackground()
                .presentationDetents([.large])
                .onChange(of: session.user?.aiConsentAt) { if session.user?.aiConsentAt != nil { askConsent = false } }
        }
        .alert("¿Retirar el permiso?", isPresented: $confirmRevoke) {
            Button("Retirar", role: .destructive) { Task { await setConsent(false) } }
        } message: {
            Text("Sin este permiso Avo no puede analizar tus fotos ni aconsejarte con tus antojos.")
        }
        .alert(
            "¿Dejar de compartir tus comidas?",
            isPresented: Binding(get: { unlinking != nil }, set: { if !$0 { unlinking = nil } }),
            presenting: unlinking
        ) { n in
            Button("Quitar", role: .destructive) { Task { await unlink(n) } }
        } message: { n in
            Text("\(n.displayName) ya no verá tus comidas.")
        }
        .alert(
            "¿Compartir tus comidas?",
            isPresented: Binding(get: { joining != nil }, set: { if !$0 { joining = nil } }),
            presenting: joining
        ) { n in
            Button("Compartir") { Task { await join(n) } }
            Button("Cancelar", role: .cancel) {}
        } message: { n in
            Text("¿Compartir tus comidas con Lic. \(n.displayName)? Podrá ver tus fotos, tu ánimo y dejarte comentarios.")
        }
        // Enlace avocado://invitar/CODIGO: abre la misma confirmación.
        .onChange(of: route.inviteCode, initial: true) {
            guard let code = route.inviteCode else { return }
            route.inviteCode = nil
            inviteCode = code
            Task { await lookup(code) }
        }
        .task {
            name = session.user?.fullName ?? ""
            goal = session.user?.dailyKcalGoal.map(String.init) ?? ""
            await loadNutritionists()
        }
    }

    /// "hoy", "ayer" o "el viernes 9 de octubre"
    private static func when(_ iso: String) -> String {
        let day = Fmt.day(Fmt.date(iso)).lowercased()
        return day == "hoy" || day == "ayer" ? day : "el \(day)"
    }

    private func run(_ key: String, _ work: () async throws -> String?) async {
        busy = key
        error = nil
        message = nil
        do {
            message = try await work()
        } catch {
            self.error = error.localizedDescription
            cheer(.oops, "Algo falló")
        }
        busy = nil
    }

    private func saveName() async {
        await run("name") {
            let updated = try await session.update(["full_name": name])
            let first = Fmt.firstName(updated.fullName)
            cheer(.love, first.isEmpty ? "¡Guardado!" : "¡Mucho gusto, \(first)!")
            return nil
        }
    }

    private func saveGoal() async {
        await run("goal") {
            let trimmed = goal.trimmingCharacters(in: .whitespaces)
            let value: Any = trimmed.isEmpty ? NSNull() : (Int(trimmed) ?? -1)
            let updated = try await session.update(["daily_kcal_goal": value])
            if let g = updated.dailyKcalGoal {
                cheer(.love, "¡Meta de \(Fmt.number(Double(g))) kcal guardada!")
            } else {
                cheer(.love, "Listo, sin meta por ahora")
            }
            return nil
        }
    }

    private func setObjective(_ goal: Goal) async {
        await run("objective") {
            try await session.update(["goal": goal.rawValue])
            let lines: [Goal: String] = [.bajar: "¡A bajar con todo!", .mantener: "¡A mantenernos!", .subir: "¡A ganar volumen!"]
            cheer(.love, lines[goal] ?? "¡Listo!")
            return nil
        }
    }

    private func setConsent(_ value: Bool) async {
        await run("consent") {
            try await session.update(["ai_consent": value])
            return nil
        }
    }

    private func loadNutritionists() async {
        if let list: [Person] = try? await api.request("GET", "/care/nutritionists") { nutritionists = list }
    }

    private func link() async {
        await run("link") {
            let _: Person = try await api.request("POST", "/care/nutritionists", json: ["email": nutriEmail.trimmingCharacters(in: .whitespaces)])
            nutriEmail = ""
            await loadNutritionists()
            cheer(.celebrate, "¡Listo! Ya puede ver tus comidas")
            return nil
        }
    }

    /// Primero se muestra quién es la nutrióloga de ese código y se pide confirmar.
    private func lookup(_ raw: String) async {
        let code = raw.trimmingCharacters(in: .whitespaces).uppercased()
        guard !code.isEmpty else { return }
        await run("lookup") {
            let who: Person = try await api.request("GET", "/care/invite/\(code)")
            joinCode = code
            joining = who
            return nil
        }
    }

    private func join(_ n: Person) async {
        await run("join") {
            let _: OKResponse = try await api.request("POST", "/care/invite/\(joinCode)")
            inviteCode = ""
            await loadNutritionists()
            await session.refresh()
            cheer(.celebrate, "¡Listo! Ya puede ver tus comidas")
            return nil
        }
    }

    /// Metas puestas por la nutrióloga: solo lectura.
    @ViewBuilder private func lockedGoals(_ user: User) -> some View {
        Section {
            LabeledContent("Meta diaria", value: user.dailyKcalGoal.map { Fmt.kcal(Double($0)) } ?? "Sin meta")
            if let g = user.proteinGGoal { LabeledContent("Proteína", value: "\(g) g") }
            if let g = user.carbsGGoal { LabeledContent("Carbohidratos", value: "\(g) g") }
            if let g = user.fatGGoal { LabeledContent("Grasa", value: "\(g) g") }
        } header: {
            Text("Tu meta diaria")
        } footer: {
            Text("Las puso tu nutrióloga.")
        }

        Section {
            LabeledContent("Objetivo", value: user.goal?.label ?? "Sin objetivo")
        } header: {
            Text("Tu objetivo")
        } footer: {
            Text("Las puso tu nutrióloga.")
        }
    }

    private func unlink(_ n: Person) async {
        await run("unlink") {
            let _: OKResponse = try await api.request("DELETE", "/care/nutritionists/\(n.id)")
            await loadNutritionists()
            return nil
        }
    }
}

/// Cerrar sesión y borrar la cuenta (lo pide la App Store: se puede borrar desde la app).
struct AccountActions: View {
    var inForm = false

    @Environment(Session.self) private var session
    @Environment(Outbox.self) private var outbox
    @State private var confirmSignOut = false
    @State private var confirmDelete = false
    @State private var deleting = false
    @State private var error: String?

    var body: some View {
        Group {
            Button("Cerrar sesión", systemImage: "rectangle.portrait.and.arrow.right") {
                if outbox.jobs.isEmpty { Task { await session.signOut() } } else { confirmSignOut = true }
            }
            Button(role: .destructive) {
                confirmDelete = true
            } label: {
                HStack {
                    Label("Borrar mi cuenta", systemImage: "trash")
                    if deleting { Spacer(); ProgressView() }
                }
            }
            .disabled(deleting)
            if let error { Text(error).font(.footnote).foregroundStyle(Theme.danger) }
        }
        .modifier(StandaloneButtons(active: !inForm))
        .alert("¿Cerrar sesión?", isPresented: $confirmSignOut) {
            Button("Cerrar sesión", role: .destructive) { Task { await session.signOut() } }
        } message: {
            Text("Tienes \(outbox.jobs.count == 1 ? "1 comida" : "\(outbox.jobs.count) comidas") sin mandar (sin conexión). Si cierras sesión se pierden.")
        }
        .alert("¿Borrar tu cuenta?", isPresented: $confirmDelete) {
            Button("Borrar todo", role: .destructive) { Task { await delete() } }
        } message: {
            Text(
                (session.user?.role == .nutritionist
                    ? "Se borran tu cuenta, tus comentarios y tus vínculos con pacientes. Las comidas de tus pacientes se quedan con ellos."
                    : "Se borran tu cuenta, todas tus comidas y fotos, los comentarios y los vínculos con tu nutrióloga.")
                    + (outbox.jobs.isEmpty ? "" : " También se pierden las comidas que siguen en el teléfono.")
                    + " No se puede deshacer."
            )
        }
    }

    private func delete() async {
        deleting = true
        error = nil
        do {
            try await session.deleteAccount()
        } catch {
            self.error = error.localizedDescription
            cheer(.oops, "No pude borrar tu cuenta")
        }
        deleting = false
    }
}

/// Fuera de un Form, los botones van uno debajo del otro con estilo propio.
private struct StandaloneButtons: ViewModifier {
    let active: Bool

    func body(content: Content) -> some View {
        if active {
            VStack(spacing: 10) { content }
                .buttonStyle(.bordered)
                .buttonBorderShape(.capsule)
                .controlSize(.large)
        } else {
            content
        }
    }
}
