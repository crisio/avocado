import CoreTransferable
import Photos
import SwiftUI
import UniformTypeIdentifiers

/// Sticker de macros para pegar en una historia de Instagram (igual que src/components/ShareSticker.tsx):
/// tarjeta verde oscura semitransparente con las calorías y tres anillos de proteína, carbs y grasa.
struct MacroStickerView: View {
    let meal: Meal

    private static let width: CGFloat = 1000
    private static let pad: CGFloat = 56

    private struct Macro: Identifiable {
        let label: String
        let color: Color
        let grams: Double
        let kcalPerGram: Double
        var id: String { label }
        var kcal: Double { grams * kcalPerGram }
    }

    private var macros: [Macro] {
        [
            Macro(label: "Proteína", color: Color(hex: 0x8DBB6A), grams: meal.proteinG ?? 0, kcalPerGram: 4),
            Macro(label: "Carbs", color: Color(hex: 0xF2C14E), grams: meal.carbsG ?? 0, kcalPerGram: 4),
            Macro(label: "Grasa", color: Color(hex: 0xEE8E7E), grams: meal.fatG ?? 0, kcalPerGram: 9),
        ]
    }

    var body: some View {
        let macros = macros
        let total = macros.reduce(0) { $0 + $1.kcal }

        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 14) {
                Image(uiImage: Sprites.frame(.love, 0, hd: false)).resizable().scaledToFit().frame(width: 56, height: 56)
                Text("Avocado").font(.display(34, weight: 700))
            }
            Text(meal.title)
                .font(.display(54, weight: 700))
                .lineLimit(2)
                .truncationMode(.tail)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 32)
            HStack(alignment: .firstTextBaseline, spacing: 14) {
                Text(Fmt.number(meal.calories ?? 0)).font(.display(112, weight: 800))
                Text("kcal").font(.display(44, weight: 700))
            }
            .padding(.top, 12)
            HStack(alignment: .top, spacing: 0) {
                ForEach(macros) { macro in
                    VStack(spacing: 12) {
                        ring(macro, share: total > 0 ? macro.kcal / total : 0)
                        Text(macro.label).font(.display(32, weight: 600))
                    }
                    .frame(maxWidth: .infinity)
                }
            }
            .padding(.top, 36)
            Text("\(Fmt.longDate(meal.eatenDate)) · \(Fmt.time(meal.eatenDate))")
                .font(.display(28, weight: 600))
                .foregroundStyle(.white.opacity(0.78))
                .padding(.top, 28)
        }
        .foregroundStyle(.white)
        .padding(Self.pad)
        .frame(width: Self.width, alignment: .leading)
        .background(Color(red: 18 / 255, green: 45 / 255, blue: 19 / 255).opacity(0.74), in: .rect(cornerRadius: 64))
        .environment(\.colorScheme, .dark)
    }

    private func ring(_ macro: Macro, share: Double) -> some View {
        ZStack {
            Circle().stroke(.white.opacity(0.2), lineWidth: 26)
            Circle()
                .trim(from: 0, to: min(share, 0.999))
                .stroke(macro.color, style: StrokeStyle(lineWidth: 26, lineCap: .round))
                .rotationEffect(.degrees(-90))
            Text(Fmt.grams(macro.grams)).font(.display(48, weight: 700))
        }
        .frame(width: 220 - 26, height: 220 - 26)
        .padding(13)
    }
}

/// Renderiza el sticker a PNG con fondo transparente (escala 3).
@MainActor func renderMacroSticker(_ meal: Meal) -> Data? {
    let renderer = ImageRenderer(content: MacroStickerView(meal: meal))
    renderer.scale = 3
    renderer.isOpaque = false
    return renderer.uiImage?.pngData()
}

/// El PNG listo para el menú de compartir.
struct StickerImage: Transferable {
    let png: Data

    static var transferRepresentation: some TransferRepresentation {
        DataRepresentation(exportedContentType: .png) { $0.png }
    }
}

/// Tarjeta del detalle de la comida: vista previa del sticker y formas de llevarlo a Instagram.
struct ShareStickerCard: View {
    let meal: Meal

    @State private var png: Data?
    @State private var notice: String?
    @State private var noticeTone: Tone = .info
    @State private var pastes = 0
    @State private var saves = 0

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            SectionTitle("Sticker para tu historia")

            preview

            if let notice { Notice(text: notice, tone: noticeTone) }

            if let png {
                Button { Task { await pasteInInstagram(png) } } label: {
                    Label("Pegar en Instagram", systemImage: "camera").frame(maxWidth: .infinity)
                }
                .primaryButton()
                HStack(spacing: 10) {
                    ShareLink(item: StickerImage(png: png), preview: SharePreview("Sticker de Avocado", image: Image(uiImage: UIImage(data: png) ?? UIImage()))) {
                        Label("Compartir", systemImage: "square.and.arrow.up").lineLimit(1).frame(maxWidth: .infinity)
                    }
                    .secondaryButton()
                    Button { Task { await saveToPhotos(png) } } label: {
                        Label("Guardar", systemImage: "square.and.arrow.down").lineLimit(1).frame(maxWidth: .infinity)
                    }
                    .secondaryButton()
                }
            }
        }
        .card()
        .task(id: meal) { png = renderMacroSticker(meal) }
        .sensoryFeedback(.success, trigger: pastes)
        .sensoryFeedback(.success, trigger: saves)
    }

    /// Vista previa sobre un fondo oscuro (como se vería sobre una foto).
    private var preview: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 18).fill(Color(hex: 0x2B3A2D))
            if let png, let image = UIImage(data: png) {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
                    .padding(16)
                    .accessibilityLabel("Vista previa del sticker con proteína, carbohidratos, grasa y calorías")
            } else {
                ProgressView().tint(.white).frame(height: 200)
            }
        }
    }

    private func pasteInInstagram(_ png: Data) async {
        // Con el tipo PNG se conserva la transparencia.
        UIPasteboard.general.setData(png, forPasteboardType: UTType.png.identifier)
        pastes += 1
        cheer(.love, "¡Sticker copiado!")
        let opened = await UIApplication.shared.open(URL(string: "instagram://story-camera")!)
        if opened {
            notice = nil
        } else {
            noticeTone = .info
            notice = "Copiado: abre tu historia en Instagram y pégalo"
        }
    }

    private func saveToPhotos(_ png: Data) async {
        let status = await PHPhotoLibrary.requestAuthorization(for: .addOnly)
        guard status == .authorized || status == .limited else {
            noticeTone = .warning
            notice = "Sin permiso para guardar en Fotos. Puedes activarlo en Ajustes."
            cheer(.oops, "No pude guardarlo")
            return
        }
        do {
            try await PHPhotoLibrary.shared().performChanges {
                PHAssetCreationRequest.forAsset().addResource(with: .photo, data: png, options: nil)
            }
            noticeTone = .info
            notice = "Guardado en Fotos"
            saves += 1
            cheer(.love, "¡Sticker guardado!")
        } catch {
            noticeTone = .warning
            notice = "No se pudo guardar: \(error.localizedDescription)"
            cheer(.oops, "No pude guardarlo")
        }
    }
}
