import SwiftUI
import UIKit

/// Lo que se celebra al registrar una comida: confeti, la foto como plato y Avo comiendo en grande.
struct CelebrationInfo: Identifiable, Equatable {
    let id = UUID()
    let title: String
    let message: String
    let photo: UIImage?
    /// Días seguidos con esta comida (nil si no se sabe).
    let streak: Int?
}

@Observable
final class CelebrationCenter {
    static let shared = CelebrationCenter()
    var current: CelebrationInfo?

    func show(_ info: CelebrationInfo) { current = info }
}

struct CelebrationView: View {
    let info: CelebrationInfo
    let onDone: () -> Void

    var body: some View {
        ZStack {
            Color.black.opacity(0.35).ignoresSafeArea().onTapGesture(perform: onDone)
            Confetti().ignoresSafeArea().allowsHitTesting(false)

            VStack(spacing: 14) {
                ZStack(alignment: .bottomTrailing) {
                    Group {
                        if let photo = info.photo {
                            Image(uiImage: photo).resizable().scaledToFill()
                        } else {
                            Theme.accentSoft
                        }
                    }
                    .frame(width: 150, height: 150)
                    .clipShape(.circle)
                    .overlay(Circle().stroke(.white, lineWidth: 6))
                    .shadow(color: .black.opacity(0.15), radius: 10, y: 4)

                    MascotView(mood: .eat, size: 112, hd: true, loop: true, dressed: true)
                        .offset(x: 46, y: 18)
                }
                .padding(.trailing, 40)
                .padding(.bottom, 8)

                Text(info.title)
                    .font(.display(30, weight: 800))
                    .foregroundStyle(Theme.ink)
                    .multilineTextAlignment(.center)
                Text(info.message)
                    .font(.body)
                    .foregroundStyle(Theme.muted)
                    .multilineTextAlignment(.center)
                if let streak = info.streak, streak > 0 {
                    HStack(spacing: 6) {
                        Flame(lit: true, size: 22)
                        Text(Fmt.daysInARow(streak)).font(.headline).foregroundStyle(Theme.ink)
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(Theme.warningSoft, in: .capsule)
                }
                Button(action: onDone) { Text("¡Listo!").frame(maxWidth: .infinity) }
                    .primaryButton()
                    .padding(.top, 4)
            }
            .padding(24)
            .frame(maxWidth: 360)
            .background(Theme.surface, in: .rect(cornerRadius: 28))
            .padding(24)
            .transition(.scale(scale: 0.85).combined(with: .opacity))
        }
        .sensoryFeedback(.success, trigger: info.id)
        .task {
            try? await Task.sleep(for: .seconds(5))
            onDone()
        }
        .accessibilityAddTraits(.isModal)
    }
}

/// Confeti que cae una vez (unos 4 segundos).
struct Confetti: View {
    private struct Piece {
        let x: Double
        let delay: Double
        let speed: Double
        let drift: Double
        let spin: Double
        let size: CGSize
        let color: Color
    }

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var start = Date.now
    private let pieces: [Piece] = {
        let colors = [Color(hex: 0xF2C14E), Color(hex: 0xEE8E7E), Color(hex: 0x8DBB6A), Color(hex: 0x2F7A3A), Color(hex: 0xD9A066)]
        return (0..<90).map { _ in
            Piece(
                x: .random(in: 0...1),
                delay: .random(in: 0...0.8),
                speed: .random(in: 0.35...0.6),
                drift: .random(in: -40...40),
                spin: .random(in: -6...6),
                size: CGSize(width: .random(in: 6...10), height: .random(in: 10...16)),
                color: colors.randomElement()!
            )
        }
    }()

    var body: some View {
        if !reduceMotion {
            TimelineView(.animation) { timeline in
                let t = timeline.date.timeIntervalSince(start)
                Canvas { context, size in
                    for piece in pieces {
                        let elapsed = t - piece.delay
                        guard elapsed > 0 else { continue }
                        let y = -20 + elapsed * piece.speed * size.height
                        guard y < size.height + 20 else { continue }
                        let x = piece.x * size.width + sin(elapsed * 2 + piece.x * 10) * piece.drift
                        var ctx = context
                        ctx.translateBy(x: x, y: y)
                        ctx.rotate(by: .radians(elapsed * piece.spin))
                        ctx.fill(Path(CGRect(origin: CGPoint(x: -piece.size.width / 2, y: -piece.size.height / 2), size: piece.size)), with: .color(piece.color))
                    }
                }
            }
        }
    }
}
