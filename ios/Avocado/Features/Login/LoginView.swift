import SwiftUI

/// Entrar con un código de 6 dígitos que llega por correo. Si es la primera vez, se crea la cuenta.
struct LoginView: View {
    private enum Step { case email, code }
    private enum Field { case email, code }

    @Environment(Session.self) private var session
    @State private var step = Step.email
    @State private var email = ""
    @State private var code = ""
    @State private var busy = false
    @State private var error: String?
    @State private var wait = 0
    @FocusState private var focus: Field?

    var body: some View {
        ScrollView {
            VStack(spacing: 22) {
                VStack(spacing: 8) {
                    MascotView(mood: .idle, size: 120, reactive: true, bubbleEdge: .top)
                        .padding(.top, 48)
                    Text("Avocado")
                        .font(.display(42, weight: 800, relativeTo: .largeTitle))
                        .foregroundStyle(Theme.ink)
                    Text("Tus comidas en fotos, con seguimiento de tu nutrióloga.")
                        .font(.body)
                        .foregroundStyle(Theme.muted)
                        .multilineTextAlignment(.center)
                }

                if step == .email { emailCard } else { codeCard }

                VStack(spacing: 4) {
                    Text("¿Qué hacemos con tus datos?").font(.footnote).foregroundStyle(Theme.muted)
                    PrivacyLink(title: "Lee la política de privacidad")
                }
            }
            .padding(.horizontal, Theme.gutter)
            .padding(.bottom, 32)
        }
        .scrollDismissesKeyboard(.interactively)
        .screenBackground()
        .task {
            #if DEBUG
            // Solo en desarrollo: correo precargado para probar en el simulador (su teclado cambia la "@").
            // xcrun simctl spawn booted defaults write com.cristopherpineda.avocado AVOCADO_DEBUG_EMAIL revision@avocado.test
            if email.isEmpty, let debugEmail = UserDefaults.standard.string(forKey: "AVOCADO_DEBUG_EMAIL") { email = debugEmail }
            #endif
            try? await Task.sleep(for: .milliseconds(600))
            cheer(.wave, "¡Hola! Soy Avo")
        }
        .task(id: wait) {
            guard wait > 0 else { return }
            try? await Task.sleep(for: .seconds(1))
            wait -= 1
        }
    }

    private var emailCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Tu correo").font(.subheadline.weight(.semibold)).foregroundStyle(Theme.ink)
            // verbatim: con texto normal SwiftUI convierte el correo de ejemplo en enlace y el campo no se puede tocar.
            TextField(text: $email, prompt: Text(verbatim: "tucorreo@gmail.com")) { Text("Tu correo") }
                .textContentType(.emailAddress)
                .keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .submitLabel(.send)
                .focused($focus, equals: .email)
                .onSubmit { Task { await requestCode() } }
                .padding(14)
                .background(Theme.sunken, in: .rect(cornerRadius: 14))
            Text("Te enviaremos un código para entrar. Si es tu primera vez, se crea tu cuenta.")
                .font(.footnote)
                .foregroundStyle(Theme.muted)
            if let error { Notice(text: error, tone: .danger) }
            Button {
                Task { await requestCode() }
            } label: {
                Group {
                    if busy { ProgressView().tint(.white) } else { Text("Enviarme un código") }
                }
                .frame(maxWidth: .infinity)
            }
            .primaryButton()
            .disabled(busy || !email.contains("@"))
        }
        .card()
    }

    private var codeCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Escribe el código de 6 dígitos que enviamos a **\(email)**.")
                .font(.body)
                .foregroundStyle(Theme.ink)
            TextField("000000", text: $code)
                .keyboardType(.numberPad)
                .textContentType(.oneTimeCode)
                .font(.display(34, relativeTo: .title1))
                .tracking(10)
                .multilineTextAlignment(.center)
                .focused($focus, equals: .code)
                .padding(.vertical, 12)
                .background(Theme.sunken, in: .rect(cornerRadius: 14))
                .disabled(busy)
                .accessibilityLabel("Código de 6 dígitos")
                .onChange(of: code) {
                    let digits = String(code.filter(\.isNumber).prefix(6))
                    if digits != code { code = digits }
                    if digits.count == 6 { Task { await verify() } }
                }
            if let error { Notice(text: error, tone: .danger) }
            Button {
                Task { await verify() }
            } label: {
                Group {
                    if busy { ProgressView().tint(.white) } else { Text("Entrar") }
                }
                .frame(maxWidth: .infinity)
            }
            .primaryButton()
            .disabled(busy || code.count != 6)

            HStack {
                Button("Cambiar correo") {
                    step = .email
                    error = nil
                    focus = .email
                }
                Spacer()
                Button(wait > 0 ? "Reenviar en \(wait) s" : "Reenviar código") {
                    Task { await requestCode() }
                }
                .disabled(wait > 0 || busy)
            }
            .font(.subheadline.weight(.semibold))
            Text("¿No llega? Revisa la carpeta de spam o promociones.")
                .font(.footnote)
                .foregroundStyle(Theme.muted)
        }
        .card()
    }

    private func requestCode() async {
        let trimmed = email.trimmingCharacters(in: .whitespaces)
        guard !busy, trimmed.contains("@") else { return }
        busy = true
        error = nil
        do {
            let _: OKResponse = try await APIClient.shared.request("POST", "/auth/code", json: ["email": trimmed])
            step = .code
            code = ""
            wait = 60
            focus = .code
            cheer(.love, "¡Te mandé un código!")
        } catch {
            self.error = error.localizedDescription
            cheer(.oops, "Algo falló")
        }
        busy = false
    }

    private struct Verified: Decodable {
        let token: String
        let user: User
    }

    private func verify() async {
        guard !busy, code.count == 6 else { return }
        busy = true
        error = nil
        do {
            let result: Verified = try await APIClient.shared.request(
                "POST", "/auth/verify", json: ["email": email.trimmingCharacters(in: .whitespaces), "code": code]
            )
            cheer(.celebrate, "¡Qué gusto verte!")
            session.signIn(token: result.token, user: result.user)
        } catch {
            self.error = error.localizedDescription
            cheer(.oops, "Ese código no funcionó")
            code = ""
            focus = .code
        }
        busy = false
    }
}

/// Primera vez: nombre y tipo de cuenta (el tipo no se puede cambiar después).
struct OnboardingView: View {
    @Environment(Session.self) private var session
    @State private var name = ""
    @State private var role: Role = .patient
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                HStack {
                    Spacer()
                    MascotView(mood: .wave, size: 110, reactive: true, bubbleEdge: .top)
                    Spacer()
                }
                .padding(.top, 40)
                VStack(alignment: .leading, spacing: 4) {
                    Text(session.user?.email ?? "").font(.subheadline).foregroundStyle(Theme.muted)
                    Text("¡Bienvenida/o!").font(.display(34, weight: 800)).foregroundStyle(Theme.ink)
                }

                VStack(alignment: .leading, spacing: 16) {
                    Text("¿Cómo te llamas?").font(.subheadline.weight(.semibold))
                    TextField("Tu nombre", text: $name)
                        .textContentType(.name)
                        .padding(14)
                        .background(Theme.sunken, in: .rect(cornerRadius: 14))

                    Text("Soy…").font(.subheadline.weight(.semibold))
                    roleOption(.patient, title: "Paciente", detail: "Quiero registrar mis comidas.", icon: "fork.knife")
                    roleOption(.nutritionist, title: "Nutrióloga / nutriólogo", detail: "Doy seguimiento a mis pacientes.", icon: "stethoscope")

                    if let error { Notice(text: error, tone: .danger) }
                    Button {
                        Task { await save() }
                    } label: {
                        Group {
                            if busy { ProgressView().tint(.white) } else { Text("Continuar") }
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .primaryButton()
                    .disabled(busy || name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
                .card()

                Button("Usar otro correo") { Task { await session.signOut() } }
                    .font(.subheadline.weight(.semibold))
                    .frame(maxWidth: .infinity)
            }
            .padding(.horizontal, Theme.gutter)
            .padding(.bottom, 32)
        }
        .scrollDismissesKeyboard(.interactively)
        .screenBackground()
    }

    private func roleOption(_ value: Role, title: String, detail: String, icon: String) -> some View {
        Button {
            role = value
        } label: {
            HStack(spacing: 12) {
                Image(systemName: icon).font(.title3).frame(width: 32)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.headline).foregroundStyle(Theme.ink)
                    Text(detail).font(.subheadline).foregroundStyle(Theme.muted)
                }
                Spacer()
                Image(systemName: role == value ? "checkmark.circle.fill" : "circle")
                    .font(.title3)
                    .foregroundStyle(role == value ? Theme.accent : Theme.line)
            }
            .padding(14)
            .background(role == value ? Theme.accentSoft : Theme.sunken, in: .rect(cornerRadius: 16))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(role == value ? .isSelected : [])
    }

    private func save() async {
        busy = true
        error = nil
        do {
            let updated = try await session.update(["full_name": name.trimmingCharacters(in: .whitespaces), "role": role.rawValue])
            let first = Fmt.firstName(updated.fullName)
            cheer(.celebrate, first.isEmpty ? "¡Listo!" : "¡Mucho gusto, \(first)!")
        } catch {
            self.error = error.localizedDescription
        }
        busy = false
    }
}

/// La app de iOS es para pacientes: a la nutrióloga la manda a la web (y puede borrar su cuenta aquí).
struct NutritionistView: View {
    @Environment(Session.self) private var session

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    MascotView(mood: .love, size: 110).padding(.top, 40)
                    Text("Hola, \(Fmt.firstName(session.user?.fullName).isEmpty ? "nutrióloga" : Fmt.firstName(session.user?.fullName))")
                        .font(.display(30, weight: 800))
                        .multilineTextAlignment(.center)
                    Text("Esta app es para que tus pacientes registren sus comidas. Para ver a tus pacientes y dejarles indicaciones, entra a Avocado en la web con este mismo correo.")
                        .multilineTextAlignment(.center)
                        .foregroundStyle(Theme.muted)
                    Link(destination: Config.webURL) {
                        Label("Abrir Avocado en la web", systemImage: "safari").frame(maxWidth: .infinity)
                    }
                    .primaryButton()
                    AccountActions()
                }
                .padding(.horizontal, Theme.gutter)
            }
            .screenBackground()
        }
    }
}
