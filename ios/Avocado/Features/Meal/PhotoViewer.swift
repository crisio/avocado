import CoreTransferable
import Photos
import SwiftUI
import UniformTypeIdentifiers

/// La foto lista para el menú de compartir.
struct PhotoFile: Transferable {
    let jpeg: Data

    static var transferRepresentation: some TransferRepresentation {
        DataRepresentation(exportedContentType: .jpeg) { $0.jpeg }
    }
}

/// Guarda una imagen en Fotos (permiso de solo agregar). Regresa un mensaje de error si no se pudo.
@MainActor func savePhotoToLibrary(_ image: UIImage) async -> String? {
    let status = await PHPhotoLibrary.requestAuthorization(for: .addOnly)
    guard status == .authorized || status == .limited else {
        return "Sin permiso para guardar en Fotos. Puedes activarlo en Ajustes."
    }
    do {
        try await PHPhotoLibrary.shared().performChanges {
            PHAssetChangeRequest.creationRequestForAsset(from: image)
        }
        return nil
    } catch {
        return "No se pudo guardar: \(error.localizedDescription)"
    }
}

/// Foto de una comida a pantalla completa sobre fondo negro: pellizca para acercar, doble toque para alternar.
/// La foto viene de la cola del teléfono (`image`) o de la API (`url`, con la caché de `ImageStore`).
struct PhotoViewer: View {
    var image: UIImage?
    var url: String?
    let canSave: Bool

    @Environment(\.dismiss) private var dismiss
    @State private var loaded: UIImage?
    @State private var failed = false
    @State private var scale: CGFloat = 1
    @State private var baseScale: CGFloat = 1
    @State private var offset: CGSize = .zero
    @State private var baseOffset: CGSize = .zero
    @State private var notice: String?
    @State private var saves = 0

    private var photo: UIImage? { image ?? loaded }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if let photo {
                Image(uiImage: photo)
                    .resizable()
                    .scaledToFit()
                    .scaleEffect(scale)
                    .offset(offset)
                    .gesture(zoom)
                    .simultaneousGesture(pan)
                    .onTapGesture(count: 2) { toggleZoom() }
                    .accessibilityLabel("Foto de la comida")
            } else if failed {
                Image(systemName: "photo").font(.largeTitle).foregroundStyle(.white.opacity(0.6))
            } else {
                ProgressView().tint(.white)
            }
        }
        .overlay(alignment: .topTrailing) {
            Button { dismiss() } label: {
                Image(systemName: "xmark").font(.headline).foregroundStyle(.white).frame(width: 44, height: 44)
                    .background(.white.opacity(0.18), in: .circle)
            }
            .padding(16)
            .accessibilityLabel("Cerrar foto")
        }
        .overlay(alignment: .bottom) {
            if canSave, let photo, let jpeg = photo.jpegData(compressionQuality: 0.95) {
                VStack(spacing: 10) {
                    if let notice { Notice(text: notice, tone: .warning) }
                    HStack(spacing: 10) {
                        ShareLink(item: PhotoFile(jpeg: jpeg), preview: SharePreview("Foto de la comida", image: Image(uiImage: photo))) {
                            Label("Compartir", systemImage: "square.and.arrow.up").lineLimit(1).frame(maxWidth: .infinity)
                        }
                        .secondaryButton()
                        Button { Task { await save(photo) } } label: {
                            Label("Guardar en Fotos", systemImage: "square.and.arrow.down").lineLimit(1).frame(maxWidth: .infinity)
                        }
                        .primaryButton()
                    }
                }
                .padding(.horizontal, Theme.gutter)
                .padding(.bottom, 16)
            }
        }
        .environment(\.colorScheme, .dark)
        .sensoryFeedback(.success, trigger: saves)
        .task(id: url) {
            guard image == nil, let url, let parsed = URL(string: url) else { return }
            loaded = await ImageStore.shared.load(parsed)
            failed = loaded == nil
        }
    }

    private var zoom: some Gesture {
        MagnifyGesture()
            .onChanged { scale = min(max(baseScale * $0.magnification, 1), 5) }
            .onEnded { _ in
                baseScale = scale
                if scale == 1 { reset() }
            }
    }

    private var pan: some Gesture {
        DragGesture()
            .onChanged { if scale > 1 { offset = CGSize(width: baseOffset.width + $0.translation.width, height: baseOffset.height + $0.translation.height) } }
            .onEnded { _ in baseOffset = offset }
    }

    private func toggleZoom() {
        withAnimation(.snappy) {
            if scale > 1 { reset() } else { scale = 2.5; baseScale = 2.5 }
        }
    }

    private func reset() {
        scale = 1
        baseScale = 1
        offset = .zero
        baseOffset = .zero
    }

    private func save(_ photo: UIImage) async {
        if let error = await savePhotoToLibrary(photo) {
            notice = error
            cheer(.oops, "No pude guardarla")
        } else {
            notice = nil
            saves += 1
            cheer(.love, "¡Foto guardada!")
        }
    }
}
