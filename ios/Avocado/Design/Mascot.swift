import SwiftUI
import UIKit

/// Ánimos de Avo. Cada uno es una tira de 4 cuadros (Assets: mascot-<ánimo>), igual que en la web (src/lib/mascot.ts).
enum Mood: String, CaseIterable {
    case idle, wave, eat, celebrate, think, sleepy, oops, love

    /// Un paso: cuadro (0–3), cuánto dura en ms y cuánto se eleva (saltos, en puntos para 88 pt de alto).
    typealias Step = (frame: Int, ms: Int, lift: CGFloat)

    var steps: [Step] {
        switch self {
        case .idle: [(0, 2600, 0), (3, 160, 0), (0, 1800, 0), (1, 600, 0), (0, 2200, 0), (2, 240, -4), (0, 300, 0)]
        case .wave: [(0, 200, 0), (1, 200, 0), (0, 200, 0), (1, 200, 0), (2, 220, 0), (3, 900, 0)]
        case .eat: [(0, 320, 0), (1, 260, 0), (2, 320, 0), (1, 260, 0), (0, 320, 0), (1, 260, 0), (3, 1000, 0)]
        case .celebrate: [(0, 170, 0), (1, 200, -12), (2, 340, -20), (1, 200, -8), (3, 1000, 0)]
        case .think: [(0, 700, 0), (1, 700, 0), (2, 700, 0), (1, 700, 0)]
        case .sleepy: [(0, 1200, 0), (1, 900, 0), (2, 1500, 0), (3, 1500, 0), (2, 1500, 0), (3, 1500, 0)]
        case .oops: [(0, 450, -4), (1, 700, 0), (2, 800, 0), (3, 900, 0)]
        case .love: [(0, 800, 0), (1, 650, 0), (2, 650, 0), (3, 1000, 0)]
        }
    }

    /// Cuadro fijo cuando el sistema pide reducir el movimiento.
    var pose: Int {
        switch self {
        case .wave, .oops: 1
        case .eat, .celebrate: 3
        case .sleepy: 2
        default: 0
        }
    }

    /// Los de fondo se repiten; las reacciones se hacen una vez y se quedan en su último cuadro.
    var loops: Bool { self == .idle || self == .think || self == .sleepy }

    var duration: Int { steps.reduce(0) { $0 + $1.ms } }

    /// Solo estos tienen tira en alta (256 px por cuadro) para verlos en grande.
    var hasHD: Bool { self == .eat || self == .celebrate }
}

/// Cuadros recortados de cada tira (se recortan una vez).
enum Sprites {
    private static var cache: [String: [UIImage]] = [:]

    static func frame(_ mood: Mood, _ index: Int, hd: Bool) -> UIImage {
        let name = "mascot-\(mood.rawValue)\(hd && mood.hasHD ? "-hd" : "")"
        if cache[name] == nil, let strip = UIImage(named: name)?.cgImage {
            let side = strip.width / 4
            cache[name] = (0..<4).compactMap { i in
                strip.cropping(to: CGRect(x: i * side, y: 0, width: side, height: strip.height)).map { UIImage(cgImage: $0) }
            }
        }
        let frames = cache[name] ?? []
        return frames.indices.contains(index) ? frames[index] : UIImage()
    }
}

/// Cualquier parte de la app llama a cheer() cuando pasa algo (comida nueva, análisis listo, error…) y Avo reacciona.
@Observable
final class MascotCenter {
    static let shared = MascotCenter()

    struct Reaction: Equatable {
        let id: Int
        let mood: Mood
        let message: String?
    }

    private(set) var reaction: Reaction?
    private var counter = 0
    private var clearTask: Task<Void, Never>?

    func cheer(_ mood: Mood, _ message: String? = nil) {
        counter += 1
        let next = Reaction(id: counter, mood: mood, message: message)
        reaction = next
        if let message { AccessibilityNotification.Announcement(message).post() }
        clearTask?.cancel()
        let ms = max(mood.duration, message == nil ? 0 : 3200)
        clearTask = Task {
            try? await Task.sleep(for: .milliseconds(ms))
            if !Task.isCancelled, reaction == next { reaction = nil }
        }
    }
}

func cheer(_ mood: Mood, _ message: String? = nil) {
    MascotCenter.shared.cheer(mood, message)
}

/// Avo, el aguacate del logo, animado.
struct MascotView: View {
    var mood: Mood = .idle
    var size: CGFloat = 88
    /// Usa las tiras en alta resolución (para verla en grande).
    var hd = false
    /// Reacciona a cheer() y muestra su globo de texto.
    var reactive = false
    /// De qué lado sale el globo.
    var bubbleEdge: Edge = .leading
    /// Repite este ánimo en bucle aunque sea una reacción (p. ej. comiendo en la celebración).
    var loop: Bool?
    /// Se queda quieto en este cuadro.
    var pose: Int?

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var center = MascotCenter.shared
    @State private var step = 0

    private var reaction: MascotCenter.Reaction? { reactive ? center.reaction : nil }

    /// Arriba (centrado), abajo (pegado a la derecha, para no salirse de la pantalla) o a la izquierda.
    private var bubbleAlignment: Alignment {
        switch bubbleEdge {
        case .top: .top
        case .bottom: .bottomTrailing
        default: .trailing
        }
    }
    private var current: Mood { reaction?.mood ?? mood }

    var body: some View {
        let steps = current.steps
        let s = steps[min(step, steps.count - 1)]
        let still = reduceMotion || pose != nil
        let frame = pose ?? (reduceMotion ? current.pose : s.frame)

        Image(uiImage: Sprites.frame(current, frame, hd: hd))
            .resizable()
            .interpolation(.high)
            .frame(width: size, height: size)
            .offset(y: still ? 0 : s.lift * size / 88)
            .animation(.spring(duration: 0.25), value: step)
            .overlay(alignment: bubbleAlignment) {
                if let message = reaction?.message {
                    Text(message)
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(Theme.ink)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(Theme.surface, in: .capsule)
                        .shadow(color: .black.opacity(0.08), radius: 8, y: 2)
                        .fixedSize()
                        .offset(x: bubbleEdge == .leading ? -size - 4 : 0, y: bubbleEdge == .top ? -40 : bubbleEdge == .bottom ? 36 : 0)
                        .transition(.scale(scale: 0.8).combined(with: .opacity))
                        .id(reaction?.id)
                }
            }
            .animation(.spring(duration: 0.3), value: reaction?.id)
            .task(id: "\(current.rawValue)-\(reaction?.id ?? 0)-\(still)") {
                step = 0
                guard !still else { return }
                let repeats = loop ?? current.loops
                repeat {
                    for i in steps.indices {
                        step = i
                        let ms = Double(steps[i].ms)
                        let wait = ms >= 1000 ? ms * Double.random(in: 0.7...1.3) : ms
                        try? await Task.sleep(for: .milliseconds(Int(wait)))
                        if Task.isCancelled { return }
                    }
                } while repeats
            }
            .onTapGesture { if reactive { cheer(Self.taps.randomElement()!.0, Self.taps.randomElement()!.1) } }
            .accessibilityElement()
            .accessibilityLabel("Avo, la mascota de Avocado")
            .accessibilityValue(reaction?.message ?? "")
    }

    private static let taps: [(Mood, String)] = [
        (.wave, "¡Hola! Soy Avo"), (.love, "¡Vas muy bien!"), (.celebrate, "¡Eso!"),
        (.eat, "¿Ya comiste?"), (.think, "Mmm… ¿qué cenamos hoy?"), (.love, "Una foto por comida y listo"),
    ]

    static func greeting(_ name: String, date: Date = .now) -> (Mood, String) {
        let hour = Fmt.calendar.component(.hour, from: date)
        let who = name.isEmpty ? "" : ", \(name)"
        if isNight(date) { return (.sleepy, "Ya es tarde\(who)… ¡a descansar!") }
        if hour < 12 { return (.wave, "¡Buenos días\(who)!") }
        if hour < 19 { return (.wave, "¡Buenas tardes\(who)!") }
        return (.wave, "¡Buenas noches\(who)!")
    }

    static func isNight(_ date: Date = .now) -> Bool {
        let hour = Fmt.calendar.component(.hour, from: date)
        return hour >= 22 || hour < 6
    }
}
