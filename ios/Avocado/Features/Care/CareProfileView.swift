import CoreImage.CIFilterBuiltins
import SwiftUI

/// Perfil de la nutrióloga: nombre, su código y QR para invitar pacientes, privacidad y cuenta.
struct CareProfileView: View {
    @Environment(Session.self) private var session
    @State private var name = ""
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        Form {
            Section {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Nutrióloga").font(.subheadline.weight(.semibold)).foregroundStyle(Theme.muted)
                        Text("Perfil").font(.display(34, weight: 800, relativeTo: .largeTitle))
                    }
                    Spacer()
                    MascotView(mood: .love, size: 76, reactive: true, bubbleEdge: .bottom)
                }
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets(top: 0, leading: 4, bottom: 4, trailing: 4))
            }

            if let error { Section { Notice(text: error, tone: .danger) }.listRowBackground(Color.clear).listRowInsets(EdgeInsets()) }

            Section {
                TextField("Tu nombre", text: $name).textContentType(.name)
                Button("Guardar nombre") { Task { await saveName() } }
                    .disabled(busy || name.trimmingCharacters(in: .whitespaces) == (session.user?.fullName ?? ""))
            } header: {
                Text("Nombre")
            } footer: {
                Text("Así te verán tus pacientes. " + (session.user?.email ?? ""))
            }

            Section {
                InviteCard()
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets())
            } header: {
                Text("Invita a tus pacientes")
            }

            Section {
                Link("Política de privacidad", destination: Config.privacyURL)
            }

            Section {
                AccountActions(inForm: true)
            } footer: {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Por ahora Avocado es gratis para nutriólogas y pacientes.")
                    Text("Avocado \(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "")")
                }
            }
        }
        .scrollContentBackground(.hidden)
        .screenBackground()
        .scrollDismissesKeyboard(.interactively)
        .toolbar(.hidden, for: .navigationBar)
        .task { name = session.user?.fullName ?? "" }
    }

    private func saveName() async {
        busy = true
        error = nil
        do {
            let updated = try await session.update(["full_name": name])
            let first = Fmt.firstName(updated.fullName)
            cheer(.love, first.isEmpty ? "¡Guardado!" : "¡Mucho gusto, \(first)!")
        } catch {
            self.error = error.localizedDescription
            cheer(.oops, "Algo falló")
        }
        busy = false
    }
}

/// Código de invitación grande, QR del enlace, compartir y copiar.
struct InviteCard: View {
    @State private var invite: CareInvite?
    @State private var error: String?
    @State private var copied = false

    var body: some View {
        VStack(spacing: 14) {
            if let invite {
                Text("Tu código").font(.subheadline.weight(.semibold)).foregroundStyle(Theme.muted)
                Text(invite.code)
                    .font(.display(44, weight: 800, relativeTo: .largeTitle))
                    .tracking(4)
                    .foregroundStyle(Theme.ink)
                    .textSelection(.enabled)
                    .minimumScaleFactor(0.6)
                    .lineLimit(1)
                if let qr = QRCode.image(for: invite.url) {
                    Image(uiImage: qr)
                        .interpolation(.none)
                        .resizable()
                        .scaledToFit()
                        .frame(width: 200, height: 200)
                        .padding(12)
                        .background(Color.white, in: .rect(cornerRadius: 16))
                        .overlay(RoundedRectangle(cornerRadius: 16).stroke(Theme.line))
                        .accessibilityLabel("Código QR de tu invitación")
                }
                FinePrint("Tu paciente puede escribir el código en Perfil → Mi nutrióloga, o abrir el enlace.")
                    .multilineTextAlignment(.center)
                if let url = URL(string: invite.url) {
                    ShareLink(item: url, message: Text("Te invito a Avocado. Mi código es \(invite.code).")) {
                        Label("Compartir enlace", systemImage: "square.and.arrow.up").frame(maxWidth: .infinity)
                    }
                    .primaryButton()
                }
                Button {
                    UIPasteboard.general.string = invite.code
                    copied = true
                    cheer(.love, "Código copiado")
                } label: {
                    Label(copied ? "Código copiado" : "Copiar código", systemImage: copied ? "checkmark" : "doc.on.doc").frame(maxWidth: .infinity)
                }
                .secondaryButton()
            } else if let error {
                Notice(text: error, tone: .warning)
                Button("Reintentar") { Task { await load() } }.secondaryButton()
            } else {
                ProgressView().padding(.vertical, 40)
            }
        }
        .frame(maxWidth: .infinity)
        .card()
        .task { await load() }
    }

    private func load() async {
        error = nil
        do {
            invite = try await APIClient.shared.request("GET", "/care/invite")
        } catch is CancellationError {
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// Hoja "Invitar pacientes" del tablero.
struct InviteSheet: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                InviteCard().padding(Theme.gutter)
            }
            .screenBackground()
            .navigationTitle("Invitar pacientes")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cerrar") { dismiss() } } }
        }
        .presentationDetents([.large])
    }
}

/// QR con CoreImage, escalado en enteros para que no se difumine.
enum QRCode {
    static func image(for text: String) -> UIImage? {
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(text.utf8)
        filter.correctionLevel = "M"
        guard let output = filter.outputImage?.transformed(by: CGAffineTransform(scaleX: 10, y: 10)),
              let cg = CIContext().createCGImage(output, from: output.extent)
        else { return nil }
        return UIImage(cgImage: cg)
    }
}
