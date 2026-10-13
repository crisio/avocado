import PhotosUI
import SwiftUI
import UIKit

/// Registrar comida: foto, hora y nota. Se guarda primero en el teléfono y la cola la sube (y el servidor la analiza).
struct AddMealView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(Session.self) private var session
    @Environment(Outbox.self) private var outbox
    @Environment(Connectivity.self) private var connectivity
    @Environment(StreakStore.self) private var streaks
    @State private var photo: UIImage?
    @State private var eatenAt = Date.now
    @State private var note = ""
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    // Antes de la primera foto, el permiso para analizarla con IA.
                    if session.user?.aiConsentAt == nil {
                        AiConsentView(onDecline: { dismiss() })
                    } else {
                        form
                    }
                }
                .padding(.horizontal, Theme.gutter)
                .padding(.bottom, 24)
            }
            .scrollDismissesKeyboard(.interactively)
            .screenBackground()
            .navigationTitle("Registrar comida")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { dismiss() } }
            }
        }
    }

    @ViewBuilder private var form: some View {
        PhotoField(photo: $photo) { cheer(.love, "¡Qué rico se ve!") }

        DatePicker("¿Cuándo comiste?", selection: $eatenAt, in: ...Date.now)
            .font(.subheadline.weight(.semibold))
            .card(padding: 14)

        VStack(alignment: .leading, spacing: 8) {
            Text("Nota (opcional)").font(.subheadline.weight(.semibold))
            TextField("Ej. sin azúcar, con una cucharada de aceite de oliva, me comí la mitad…", text: $note, axis: .vertical)
                .lineLimit(2...5)
                .padding(12)
                .background(Theme.sunken, in: .rect(cornerRadius: 14))
            Text("Ayuda a la IA con lo que no se ve en la foto.").font(.footnote).foregroundStyle(Theme.muted)
        }
        .card()

        if !connectivity.online {
            Notice(text: "Sin conexión: la comida se guarda en el teléfono y se analiza sola al volver la señal.", tone: .warning)
        }
        if let error { Notice(text: error, tone: .danger) }

        Button(action: save) {
            Label(connectivity.online ? "Guardar y analizar" : "Guardar en el teléfono", systemImage: "checkmark")
                .font(.headline)
                .frame(maxWidth: .infinity)
        }
        .primaryButton()
        .disabled(photo == nil || busy)
    }

    private func save() {
        guard let photo, let user = session.user else { return }
        busy = true
        guard let jpeg = ImageTools.jpeg(photo) else {
            error = "No se pudo procesar la foto"
            busy = false
            return
        }
        let trimmed = note.trimmingCharacters(in: .whitespacesAndNewlines)
        let job = MealJob(id: UUID().uuidString.lowercased(), userId: user.id, eatenAt: eatenAt, note: trimmed.isEmpty ? nil : trimmed, createdAt: .now)
        do {
            try outbox.enqueue(job, jpeg: jpeg)
        } catch {
            self.error = "No pude guardar la foto en el teléfono"
            cheer(.oops, "No pude guardar la foto")
            busy = false
            return
        }
        // La racha solo cuenta si es de hoy.
        let streak = Fmt.isToday(eatenAt) ? streaks.afterNewMealToday() : nil
        let name = Fmt.firstName(user.fullName)
        CelebrationCenter.shared.show(CelebrationInfo(
            title: "¡Comida registrada!",
            message: connectivity.online
                ? "¡Buen provecho\(name.isEmpty ? "" : ", \(name)")! Avo ya está analizando tu foto."
                : "Quedó guardada en el teléfono. Avo la analiza en cuanto vuelva la señal.",
            photo: photo,
            streak: streak
        ))
        dismiss()
    }
}

/// Foto de la comida: con la cámara o de la galería.
struct PhotoField: View {
    @Binding var photo: UIImage?
    var prompt = "Agrega una foto de tu comida"
    var onPick: () -> Void = {}

    @State private var item: PhotosPickerItem?
    @State private var showCamera = false
    private let hasCamera = UIImagePickerController.isSourceTypeAvailable(.camera)

    var body: some View {
        VStack(spacing: 12) {
            Group {
                if let photo {
                    Image(uiImage: photo).resizable().scaledToFill()
                } else {
                    VStack(spacing: 8) {
                        Image(systemName: "camera.fill").font(.system(size: 36))
                        Text(prompt).font(.subheadline.weight(.semibold))
                    }
                    .foregroundStyle(Theme.muted)
                }
            }
            .frame(maxWidth: .infinity)
            .frame(height: 260)
            .background(Theme.sunken)
            .clipShape(.rect(cornerRadius: Theme.radius))
            .accessibilityLabel(photo == nil ? "Sin foto" : "Foto elegida")

            HStack(spacing: 10) {
                if hasCamera {
                    Button { showCamera = true } label: {
                        Label("Tomar foto", systemImage: "camera").frame(maxWidth: .infinity)
                    }
                    .secondaryButton()
                }
                PhotosPicker(selection: $item, matching: .images) {
                    Label(hasCamera ? "Galería" : "Elegir foto", systemImage: "photo.on.rectangle").frame(maxWidth: .infinity)
                }
                .secondaryButton()
            }
        }
        .onChange(of: item) {
            guard let item else { return }
            Task {
                if let data = try? await item.loadTransferable(type: Data.self), let image = UIImage(data: data) {
                    photo = image
                    onPick()
                }
            }
        }
        .fullScreenCover(isPresented: $showCamera) {
            CameraPicker { image in
                photo = image
                onPick()
            }
            .ignoresSafeArea()
        }
    }
}

/// La cámara del sistema.
struct CameraPicker: UIViewControllerRepresentable {
    let onPick: (UIImage) -> Void
    @Environment(\.dismiss) private var dismiss

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ controller: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let parent: CameraPicker
        init(_ parent: CameraPicker) { self.parent = parent }

        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            if let image = info[.originalImage] as? UIImage { parent.onPick(image) }
            parent.dismiss()
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            parent.dismiss()
        }
    }
}
