import SwiftUI

// Piezas del kit "Fresco" en SwiftUI (las equivalentes de ui/src).

extension View {
    /// Tarjeta blanca redondeada.
    func card(padding: CGFloat = 20) -> some View {
        self
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.surface, in: .rect(cornerRadius: Theme.radius))
    }

    /// Botón principal: verde, ancho y en cápsula.
    func primaryButton() -> some View {
        self.buttonStyle(.borderedProminent).buttonBorderShape(.capsule).controlSize(.large)
    }

    func secondaryButton() -> some View {
        self.buttonStyle(.bordered).buttonBorderShape(.capsule).controlSize(.large)
    }

    /// Fondo de pantalla de la app.
    func screenBackground() -> some View {
        self.background(Theme.ground.ignoresSafeArea())
    }
}

struct SectionTitle: View {
    let text: String
    init(_ text: String) { self.text = text }

    var body: some View {
        Text(text)
            .font(.display(21, relativeTo: .title3))
            .foregroundStyle(Theme.ink)
            .accessibilityAddTraits(.isHeader)
    }
}

/// Encabezado grande de pantalla: renglón chico arriba (fecha, rol…), título y algo a la derecha (Avo).
struct PageHeader<Trailing: View>: View {
    var eyebrow: String?
    let title: String
    @ViewBuilder var trailing: () -> Trailing

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                if let eyebrow {
                    Text(eyebrow).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.muted)
                }
                Text(title)
                    .font(.display(34, weight: 800, relativeTo: .largeTitle))
                    .foregroundStyle(Theme.ink)
                    .accessibilityAddTraits(.isHeader)
            }
            Spacer(minLength: 0)
            trailing()
        }
    }
}

extension PageHeader where Trailing == EmptyView {
    init(eyebrow: String? = nil, title: String) {
        self.init(eyebrow: eyebrow, title: title) { EmptyView() }
    }
}

enum Tone {
    case info, warning, danger

    var foreground: Color {
        switch self {
        case .info: Theme.accentStrong
        case .warning: Theme.warningInk
        case .danger: Theme.danger
        }
    }

    var background: Color {
        switch self {
        case .info: Theme.accentSoft
        case .warning: Theme.warningSoft
        case .danger: Theme.dangerSoft
        }
    }
}

struct Chip: View {
    let text: String
    var icon: String?
    var tone: Tone = .warning

    var body: some View {
        HStack(spacing: 4) {
            if let icon { Image(systemName: icon).imageScale(.small) }
            Text(text)
        }
        .font(.footnote.weight(.semibold))
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .foregroundStyle(tone.foreground)
        .background(tone.background, in: .capsule)
    }
}

/// Mensaje dentro de una tarjeta o formulario ("Código incorrecto", "Sin conexión…").
struct Notice: View {
    let text: String
    var tone: Tone = .info

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Image(systemName: tone == .info ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
            Text(text).frame(maxWidth: .infinity, alignment: .leading)
        }
        .font(.subheadline)
        .foregroundStyle(tone.foreground)
        .padding(12)
        .background(tone.background, in: .rect(cornerRadius: 14))
        .accessibilityElement(children: .combine)
    }
}

/// Texto chico gris de aviso ("Estimación con IA…").
struct FinePrint: View {
    let text: String
    init(_ text: String) { self.text = text }

    var body: some View {
        Text(text).font(.footnote).foregroundStyle(Theme.muted).fixedSize(horizontal: false, vertical: true)
    }
}

/// Proteína, carbohidratos y grasa en chips.
struct MacroChips: View {
    let protein: Double
    let carbs: Double
    let fat: Double
    /// Metas en gramos (opcionales): con meta, cada chip muestra "74 / 120 g".
    var proteinGoal: Int?
    var carbsGoal: Int?
    var fatGoal: Int?

    var body: some View {
        HStack(spacing: 8) {
            chip("Proteína", protein, proteinGoal, Color(hex: 0x8DBB6A))
            chip("Carbs", carbs, carbsGoal, Color(hex: 0xF2C14E))
            chip("Grasa", fat, fatGoal, Color(hex: 0xEE8E7E))
        }
    }

    private func chip(_ label: String, _ grams: Double, _ goal: Int?, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(goal.map { "\(Int(grams.rounded())) / \($0) g" } ?? Fmt.grams(grams))
                .font(.display(19, relativeTo: .headline)).foregroundStyle(Theme.ink)
                .lineLimit(1).minimumScaleFactor(0.7)
            HStack(spacing: 5) {
                Circle().fill(color).frame(width: 8, height: 8)
                Text(label).font(.caption.weight(.semibold)).foregroundStyle(Theme.muted)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(Theme.surface, in: .rect(cornerRadius: 16))
        .accessibilityElement(children: .combine)
    }
}

/// Burbuja de comentario (la nutrióloga en verde).
struct CommentBubble: View {
    let author: String
    let role: Role?
    let time: String
    let text: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                Text(author).font(.footnote.weight(.bold))
                if role == .nutritionist {
                    Text("Nutrióloga").font(.caption2.weight(.semibold)).padding(.horizontal, 6).padding(.vertical, 2)
                        .background(Theme.accent.opacity(0.15), in: .capsule)
                }
                Spacer(minLength: 4)
                Text(time).font(.caption).foregroundStyle(Theme.muted)
            }
            Text(text).font(.subheadline).foregroundStyle(Theme.ink).fixedSize(horizontal: false, vertical: true)
        }
        .padding(12)
        .background(role == .nutritionist ? Theme.accentSoft : Theme.surface, in: .rect(cornerRadius: 16))
        .accessibilityElement(children: .combine)
    }
}

/// Fueguito de la racha: prendido si ese día registró.
struct Flame: View {
    var lit: Bool
    var size: CGFloat = 22

    var body: some View {
        Image(systemName: "flame.fill")
            .font(.system(size: size))
            .foregroundStyle(
                lit
                    ? AnyShapeStyle(LinearGradient(colors: [Color(hex: 0xFFC94A), Color(hex: 0xF07A2B), Color(hex: 0xD9432B)], startPoint: .top, endPoint: .bottom))
                    : AnyShapeStyle(Theme.line)
            )
            .accessibilityHidden(true)
    }
}

/// "‹  Hoy  ›" para moverse entre días o semanas.
struct DayNav: View {
    let label: String
    let onPrev: () -> Void
    let onNext: () -> Void
    var nextDisabled = false

    var body: some View {
        HStack {
            Button(action: onPrev) { Image(systemName: "chevron.left").frame(width: 44, height: 44) }
                .accessibilityLabel("Anterior")
            Spacer()
            Text(label).font(.headline).foregroundStyle(Theme.ink).contentTransition(.numericText())
            Spacer()
            Button(action: onNext) { Image(systemName: "chevron.right").frame(width: 44, height: 44) }
                .disabled(nextDisabled)
                .accessibilityLabel("Siguiente")
        }
        .font(.body.weight(.semibold))
        .background(Theme.surface, in: .capsule)
    }
}

/// Enlace a la política de privacidad (se abre en el navegador dentro de la app).
struct PrivacyLink: View {
    var title = "Política de privacidad"

    var body: some View {
        Link(title, destination: Config.privacyURL).font(.footnote.weight(.semibold))
    }
}

/// Selector Todo · ¾ · ½ · ¼ (· Nada) para porciones.
struct FractionPicker: View {
    static let withNothing: [(Double, String)] = [(1, "Todo"), (0.75, "¾"), (0.5, "½"), (0.25, "¼"), (0, "Nada")]
    static let eating: [(Double, String)] = [(1, "Todo"), (0.75, "¾"), (0.5, "½"), (0.25, "¼")]

    let label: String
    var options = FractionPicker.withNothing
    @Binding var value: Double

    var body: some View {
        Picker(label, selection: $value) {
            ForEach(options, id: \.0) { option in
                Text(option.1).tag(option.0).accessibilityLabel(Self.spoken(option.0))
            }
        }
        .pickerStyle(.segmented)
    }

    static func spoken(_ f: Double) -> String {
        switch f {
        case 1: "Todo"
        case 0.75: "Tres cuartos"
        case 0.5: "La mitad"
        case 0.25: "Un cuarto"
        case 0: "Nada"
        default: "\(Int(f * 100)) por ciento"
        }
    }
}
