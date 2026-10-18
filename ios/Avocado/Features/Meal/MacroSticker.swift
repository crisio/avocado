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

/// Imagen para la historia (1080×1920, igual que src/components/ShareSticker.tsx): la foto de la comida en cuadrado
/// arriba (el centro, donde suele estar el plato) y el sticker abajo, para que no tape la comida; de fondo, la misma foto
/// difuminada.
@MainActor func renderStoryImage(photo: UIImage, sticker: UIImage) -> UIImage {
    let size = CGSize(width: 1080, height: 1920)
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    format.opaque = true

    func fill(_ image: CGSize, in rect: CGRect) -> CGRect {
        let scale = max(rect.width / image.width, rect.height / image.height)
        let w = image.width * scale, h = image.height * scale
        return CGRect(x: rect.midX - w / 2, y: rect.midY - h / 2, width: w, height: h)
    }
    func fit(_ image: CGSize, in rect: CGRect) -> CGRect {
        let scale = min(rect.width / image.width, rect.height / image.height)
        let w = image.width * scale, h = image.height * scale
        return CGRect(x: rect.midX - w / 2, y: rect.minY, width: w, height: h)
    }

    // Difuminado barato: la foto dibujada diminuta y luego estirada.
    let tinySize = CGSize(width: 27, height: 48)
    let tiny = UIGraphicsImageRenderer(size: tinySize, format: format).image { _ in
        photo.draw(in: fill(photo.size, in: CGRect(origin: .zero, size: tinySize)))
    }
    return UIGraphicsImageRenderer(size: size, format: format).image { ctx in
        ctx.cgContext.interpolationQuality = .high
        tiny.draw(in: CGRect(origin: .zero, size: size))
        UIColor.black.withAlphaComponent(0.25).setFill()
        ctx.fill(CGRect(origin: .zero, size: size))

        let photoRect = CGRect(x: 100, y: 170, width: 880, height: 880)
        ctx.cgContext.saveGState()
        UIBezierPath(roundedRect: photoRect, cornerRadius: 48).addClip()
        photo.draw(in: fill(photo.size, in: photoRect))
        ctx.cgContext.restoreGState()

        sticker.draw(in: fit(sticker.size, in: CGRect(x: 100, y: 1100, width: 880, height: 670)))
    }
}

/// Menú de compartir del sistema (para la historia cuando no hay Instagram instalado).
struct ActivitySheet: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
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
    /// La historia armada (foto + sticker), cuando ya bajó la foto.
    @State private var story: UIImage?
    /// Menú de compartir para la historia cuando no hay Instagram.
    @State private var shareSheet: UIImage?
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
                if let story {
                    Button { Task { await postToInstagram(story) } } label: {
                        Label("Publicar en tu historia", systemImage: "camera").frame(maxWidth: .infinity)
                    }
                    .primaryButton()
                } else {
                    Button {} label: {
                        Label("Armando tu historia…", systemImage: "camera").frame(maxWidth: .infinity)
                    }
                    .primaryButton()
                    .disabled(true)
                }
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
            if let png, let sticker = UIImage(data: png), let url = URL(string: meal.photoUrl), let photo = await ImageStore.shared.load(url) {
                story = renderStoryImage(photo: photo, sticker: sticker)
            }
        }
        .sheet(isPresented: Binding(get: { shareSheet != nil }, set: { if !$0 { shareSheet = nil } })) {
            if let shareSheet { ActivitySheet(items: [shareSheet]).presentationDetents([.medium, .large]) }
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

    /// Vista previa: la historia tal cual se publica (o el sticker sobre la foto difuminada mientras baja la foto).
    private var preview: some View {
        Group {
            if let story {
                Image(uiImage: story)
                    .resizable()
                    .scaledToFit()
                    .frame(maxHeight: 420)
                    .clipShape(.rect(cornerRadius: 14))
                    .padding(12)
                    .accessibilityLabel("Vista previa de tu historia: la foto de tu comida y abajo el sticker con calorías y macros")
            } else if let png, let image = UIImage(data: png) {
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

    /**
     La historia armada queda en el carrete y se abre Instagram:
     - Con el ID de la app de Meta, directo en el editor con la historia cargada (lista para publicar).
     - Sin él, en la cámara de historias: la historia es la foto más reciente, la de la miniatura de abajo a la izquierda.
     Sin Instagram, el menú de compartir.
     */
    private func postToInstagram(_ story: UIImage) async {
        guard let data = story.jpegData(compressionQuality: 0.92) else { return }
        let saved = await saveStoryToPhotos(data)
        pastes += 1

        if let appID = Config.facebookAppID, let url = URL(string: "instagram-stories://share?source_application=\(appID)") {
            UIPasteboard.general.setItems(
                [["com.instagram.sharedSticker.backgroundImage": data]],
                options: [.expirationDate: Date.now.addingTimeInterval(300)]
            )
            if await UIApplication.shared.open(url) {
                notice = nil
                cheer(.love, "¡Lista tu historia!")
                return
            }
        }
        if await UIApplication.shared.open(URL(string: "instagram://story-camera")!) {
            noticeTone = .info
            notice = saved
                ? "Tu historia quedó en tu carrete: en Instagram toca la foto de abajo a la izquierda y publícala."
                : "Abre tu carrete en Instagram y elige tu historia."
            cheer(.love, saved ? "Toca la foto de abajo a la izquierda 👇" : "¡Ya casi!")
        } else {
            // Sin Instagram: el menú de compartir.
            shareSheet = story
        }
    }

    /// Guarda la historia en Fotos (solo agregar). false si no hay permiso o falla.
    private func saveStoryToPhotos(_ data: Data) async -> Bool {
        let status = await PHPhotoLibrary.requestAuthorization(for: .addOnly)
        guard status == .authorized || status == .limited else { return false }
        do {
            try await PHPhotoLibrary.shared().performChanges {
                PHAssetCreationRequest.forAsset().addResource(with: .photo, data: data, options: nil)
            }
            return true
        } catch {
            return false
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
