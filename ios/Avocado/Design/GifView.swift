import ImageIO
import SwiftUI

/// Reproduce un WebP/GIF animado con ImageIO (sin AVPlayer: un reproductor de video interrumpiría la música del usuario).
@Observable
private final class GifPlayer {
    private(set) var frame: CGImage?
    /// Se sube al detener: el bloque de ImageIO ve que ya no es el suyo y se corta solo.
    private var generation = 0

    func play(_ data: Data) {
        generation += 1
        let mine = generation
        // El bloque se llama en el hilo principal, cuadro por cuadro; no guarda la vista ni el reproductor fuerte.
        CGAnimateImageDataWithBlock(data as CFData, nil) { [weak self] _, image, stop in
            MainActor.assumeIsolated {
                guard let self, self.generation == mine else { return stop.pointee = true }
                self.frame = image
            }
        }
    }

    func stop() { generation += 1 }
}

/// GIF de reacción de GIPHY. Muestra el primer cuadro mientras baja (o si falla) y no se mueve si el usuario pidió reducir el movimiento.
struct GifView: View {
    let gif: Gif
    /// Con false no lleva la leyenda de GIPHY (si ya aparece cerca).
    var credit = true

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var player = GifPlayer()

    private var ratio: CGFloat { gif.width > 0 && gif.height > 0 ? CGFloat(gif.width) / CGFloat(gif.height) : 1 }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            ZStack {
                Theme.sunken
                if let frame = player.frame, !reduceMotion {
                    Image(decorative: frame, scale: 1).resizable().scaledToFill()
                } else {
                    AsyncImage(url: URL(string: gif.still)) { phase in
                        if let image = phase.image { image.resizable().scaledToFill() }
                    }
                }
            }
            .aspectRatio(ratio, contentMode: .fit)
            .frame(maxWidth: 240)
            .clipShape(.rect(cornerRadius: 14))
            .accessibilityElement()
            .accessibilityLabel(gif.title.isEmpty ? "GIF" : gif.title)
            .accessibilityAddTraits(.isImage)

            if credit {
                Text("vía GIPHY").font(.caption2).foregroundStyle(Theme.muted)
            }
        }
        .task(id: "\(gif.webp)-\(reduceMotion)") {
            guard !reduceMotion, let url = URL(string: gif.webp) else { return }
            guard let (data, response) = try? await URLSession.shared.data(from: url),
                  (response as? HTTPURLResponse)?.statusCode == 200,
                  !Task.isCancelled else { return }
            player.play(data)
        }
        .onDisappear { player.stop() }
    }
}
