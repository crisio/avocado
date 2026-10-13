import SwiftUI
import UIKit

enum ImageTools {
    /// JPEG para subir: lado mayor de 1280 px y calidad 0.8, como la app web (queda muy por debajo de los 5 MB).
    static func jpeg(_ image: UIImage, maxSide: CGFloat = 1280, quality: CGFloat = 0.8) -> Data? {
        let scale = min(1, maxSide / max(image.size.width, image.size.height))
        let size = CGSize(width: (image.size.width * scale).rounded(), height: (image.size.height * scale).rounded())
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        // Dibujarla también la endereza (las fotos de la cámara traen la orientación aparte).
        let resized = UIGraphicsImageRenderer(size: size, format: format).image { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
        return resized.jpegData(compressionQuality: quality)
    }
}

/**
 Fotos de las comidas. La URL firmada cambia cada hora (?exp=&sig=), así que se guardan por su ruta: una foto ya
 vista se muestra al instante aunque la firma sea otra.
 */
final class ImageStore {
    static let shared = ImageStore()
    private let cache = NSCache<NSString, UIImage>()

    private func key(_ url: URL) -> NSString { url.path() as NSString }

    func cached(_ url: URL) -> UIImage? { cache.object(forKey: key(url)) }

    func load(_ url: URL) async -> UIImage? {
        if let image = cached(url) { return image }
        guard let (data, response) = try? await URLSession.shared.data(from: url),
              (response as? HTTPURLResponse)?.statusCode == 200,
              let image = UIImage(data: data) else { return nil }
        cache.setObject(image, forKey: key(url))
        return image
    }

    func clear() { cache.removeAllObjects() }
}

/// Foto de una comida desde la API (con su caché).
struct RemoteImage: View {
    let url: String
    @State private var image: UIImage?
    @State private var failed = false

    var body: some View {
        Rectangle()
            .fill(Theme.sunken)
            .overlay {
                if let image {
                    Image(uiImage: image).resizable().scaledToFill()
                } else if failed {
                    Image(systemName: "photo").foregroundStyle(Theme.muted)
                } else {
                    ProgressView()
                }
            }
            .clipped()
            .task(id: URL(string: url)?.path()) {
                guard let parsed = URL(string: url) else { return failed = true }
                if let cached = ImageStore.shared.cached(parsed) { return image = cached }
                image = await ImageStore.shared.load(parsed)
                failed = image == nil
            }
            .accessibilityLabel("Foto de la comida")
    }
}
