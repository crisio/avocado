import CoreTransferable
import Photos
import SwiftUI
import UniformTypeIdentifiers

/// Estilo del sticker (igual que THEMES en src/components/ShareSticker.tsx): fondo, texto y los tres anillos, con contraste entre sí.
enum StickerTheme: String, CaseIterable, Identifiable {
    case dia, noche, romantica, cheat, fresco

    var id: String { rawValue }

    var name: String {
        switch self {
        case .dia: "Día"
        case .noche: "Noche"
        case .romantica: "Cena romántica"
        case .cheat: "Cheat meal"
        case .fresco: "Fresco"
        }
    }

    /// Fondo de la tarjeta: un color o dos para el degradado diagonal.
    var background: [Color] {
        switch self {
        case .dia: [Color(hex: 0xFFFBF0)]
        case .noche: [Color(hex: 0x122D13)]
        case .romantica: [Color(hex: 0x4A0D26), Color(hex: 0x7E1D40)]
        case .cheat: [Color(hex: 0xFF8A00), Color(hex: 0xE6007E)]
        case .fresco: [Color(hex: 0xE6F8EC), Color(hex: 0xBFEBD2)]
        }
    }

    var text: Color {
        switch self {
        case .dia: Color(hex: 0x18221B)
        case .noche, .cheat: .white
        case .romantica: Color(hex: 0xFFEDEF)
        case .fresco: Color(hex: 0x0F3B24)
        }
    }

    /// Fecha y hora.
    var soft: Color { text.opacity(self == .cheat ? 0.88 : 0.72) }
    /// Pista del anillo.
    var track: Color { text.opacity(self == .cheat ? 0.28 : 0.16) }

    /// Proteína, carbs y grasa.
    var rings: [Color] {
        switch self {
        case .dia: [Color(hex: 0x3F8F2A), Color(hex: 0xE0A100), Color(hex: 0xE2573F)]
        case .noche: [Color(hex: 0x8DBB6A), Color(hex: 0xF2C14E), Color(hex: 0xEE8E7E)]
        case .romantica: [Color(hex: 0xFF8FB5), Color(hex: 0xF6C76B), Color(hex: 0xFF6F7D)]
        case .cheat: [Color(hex: 0xD9FF5C), Color(hex: 0xFFF176), .white]
        case .fresco: [Color(hex: 0x2A9148), Color(hex: 0xD68A00), Color(hex: 0xE0503F)]
        }
    }

    /// Texto de la marca y su color.
    var brand: String { self == .cheat ? "Cheat meal 🍕" : "Avocado" }
    var brandColor: Color {
        switch self {
        case .dia: Color(hex: 0x2F7A3A)
        case .romantica: Color(hex: 0xF6C76B)
        case .fresco: Color(hex: 0x1D7A3C)
        default: text
        }
    }

    /// Fondo completo (para las muestras).
    var swatch: LinearGradient {
        LinearGradient(colors: background + (background.count == 1 ? background : []), startPoint: .topLeading, endPoint: .bottomTrailing)
    }
}

/// Sticker de macros para pegar en una historia de Instagram (igual que src/components/ShareSticker.tsx):
/// tarjeta con las calorías y tres anillos de proteína, carbs y grasa. `transparency` (0–0,7) solo afecta el fondo de la tarjeta.
struct MacroStickerView: View {
    let meal: Meal
    var theme: StickerTheme = .dia
    var transparency: Double = 0

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
            Macro(label: "Proteína", color: theme.rings[0], grams: meal.proteinG ?? 0, kcalPerGram: 4),
            Macro(label: "Carbs", color: theme.rings[1], grams: meal.carbsG ?? 0, kcalPerGram: 4),
            Macro(label: "Grasa", color: theme.rings[2], grams: meal.fatG ?? 0, kcalPerGram: 9),
        ]
    }

    var body: some View {
        let macros = macros
        let total = macros.reduce(0) { $0 + $1.kcal }

        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 14) {
                Image(uiImage: Sprites.frame(.love, 0, hd: false)).resizable().scaledToFit().frame(width: 56, height: 56)
                Text(theme.brand).font(.display(34, weight: 700)).foregroundStyle(theme.brandColor)
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
                .foregroundStyle(theme.soft)
                .padding(.top, 28)
        }
        .foregroundStyle(theme.text)
        .padding(Self.pad)
        .frame(width: Self.width, alignment: .leading)
        .background(
            LinearGradient(colors: theme.background + (theme.background.count == 1 ? theme.background : []), startPoint: .topLeading, endPoint: .bottomTrailing)
                .opacity(1 - min(max(transparency, 0), 0.7)),
            in: .rect(cornerRadius: 64)
        )
    }

    private func ring(_ macro: Macro, share: Double) -> some View {
        ZStack {
            Circle().stroke(theme.track, lineWidth: 26)
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
@MainActor func renderMacroSticker(_ meal: Meal, theme: StickerTheme = .dia, transparency: Double = 0) -> Data? {
    let renderer = ImageRenderer(content: MacroStickerView(meal: meal, theme: theme, transparency: transparency))
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

    // Lo último que eligió el usuario (transparencia en %, de 0 a 70).
    @AppStorage("stickerTheme") private var themeId = StickerTheme.dia.rawValue
    @AppStorage("stickerTransparency") private var transparencyPercent = 0
    @State private var png: Data?
    @State private var notice: String?
    @State private var noticeTone: Tone = .info
    @State private var pastes = 0
    @State private var saves = 0

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            SectionTitle("Sticker para tu historia")

            preview
            themePicker
            VStack(alignment: .leading, spacing: 2) {
                HStack {
                    Text("Transparencia").font(.subheadline.weight(.semibold))
                    Spacer()
                    Text("\(transparencyPercent) %").font(.subheadline).foregroundStyle(Theme.muted).monospacedDigit()
                }
                Slider(value: Binding(get: { Double(transparencyPercent) }, set: { transparencyPercent = Int($0.rounded()) }), in: 0...70, step: 5)
                    .accessibilityLabel("Transparencia del fondo")
            }

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
                Button { Task { await savePhoto() } } label: {
                    Label("Guardar foto", systemImage: "photo").frame(maxWidth: .infinity)
                }
                .secondaryButton()
            }
        }
        .card()
        .task(id: "\(meal.id)|\(meal.calories ?? 0)|\(meal.proteinG ?? 0)|\(meal.carbsG ?? 0)|\(meal.fatG ?? 0)|\(meal.title)|\(themeId)|\(transparencyPercent)") {
            png = renderMacroSticker(meal, theme: theme, transparency: Double(transparencyPercent) / 100)
        }
        .sensoryFeedback(.success, trigger: pastes)
        .sensoryFeedback(.success, trigger: saves)
    }

    private var theme: StickerTheme { StickerTheme(rawValue: themeId) ?? .dia }

    /// Fila de muestras (se desplaza si no caben).
    private var themePicker: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(StickerTheme.allCases) { option in
                    let selected = option == theme
                    Button {
                        themeId = option.rawValue
                    } label: {
                        HStack(spacing: 8) {
                            Circle().fill(option.swatch).frame(width: 24, height: 24).overlay(Circle().stroke(.black.opacity(0.15), lineWidth: 1))
                            Text(option.name).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.ink)
                        }
                        .padding(.leading, 6)
                        .padding(.trailing, 12)
                        .padding(.vertical, 6)
                        .background(selected ? Theme.accentSoft : Theme.surface, in: .capsule)
                        .overlay(Capsule().stroke(selected ? Theme.accent : Theme.line, lineWidth: 2))
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(selected ? .isSelected : [])
                }
            }
            .padding(.vertical, 2)
        }
    }

    /// Vista previa sobre la foto de la comida, difuminada (como se vería al pegarlo en una historia).
    private var preview: some View {
        Group {
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
        .frame(maxWidth: .infinity)
        .background {
            ZStack {
                Color(hex: 0x2B3A2D)
                RemoteImage(url: meal.photoUrl).blur(radius: 6).scaleEffect(1.1)
            }
        }
        .clipShape(.rect(cornerRadius: 18))
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

    /// La foto de la comida (no el sticker) para subirla a la historia: no está en el carrete.
    private func savePhoto() async {
        guard let url = URL(string: meal.photoUrl), let photo = await ImageStore.shared.load(url) else {
            noticeTone = .warning
            notice = "No se pudo bajar la foto"
            cheer(.oops, "No pude guardarla")
            return
        }
        if let error = await savePhotoToLibrary(photo) {
            noticeTone = .warning
            notice = error
            cheer(.oops, "No pude guardarla")
        } else {
            noticeTone = .info
            notice = "Foto guardada en Fotos"
            saves += 1
            cheer(.love, "¡Foto guardada!")
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
