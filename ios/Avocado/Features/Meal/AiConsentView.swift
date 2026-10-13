import SwiftUI

/**
 Permiso para mandar fotos y notas a la IA de otras empresas (App Store 5.1.2(i)). Sin él la API no analiza nada.
 Mismo texto que src/components/AiConsent.tsx: si cambian los modelos (AI_MODELS en api/wrangler.jsonc), cambia los dos.
 */
struct AiConsentView: View {
    var onDecline: (() -> Void)?

    @Environment(Session.self) private var session
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 12) {
                MascotView(mood: .think, size: 64)
                Text("Avo usa inteligencia artificial").font(.display(22, relativeTo: .title2)).foregroundStyle(Theme.ink)
            }
            Group {
                Text("Para calcular calorías y macros, Avocado manda a un modelo de IA de otra empresa:")
                VStack(alignment: .leading, spacing: 6) {
                    bullet("La foto de tu comida y tu nota.")
                    bullet("Tus correcciones («me dejé la mitad…»).")
                    bullet("En «¿Me lo como?»: la foto del antojo, tu primer nombre, lo que llevas hoy y tu meta.")
                    bullet("Cómo te sientes (hambre, ánimo, energía, si vas con tu plan) y tus últimas comidas, para aconsejarte y encontrar tus patrones.")
                    bullet("Lo que le escribes o le dices en audio a Avo en el chat (el audio no se guarda, solo lo que dijiste).")
                }
                Text("Lo reciben **OpenRouter** y los modelos de **Google** (Gemini) y **OpenAI** (GPT), solo para darte el resultado. No les mandamos tu correo.")
            }
            .foregroundStyle(Theme.ink)
            Text("Los resultados son estimaciones y pueden equivocarse: no son consejo médico. Puedes retirar el permiso cuando quieras en Perfil.")
                .font(.footnote)
                .foregroundStyle(Theme.muted)
            PrivacyLink()
            if let error { Notice(text: error, tone: .danger) }
            Button {
                Task { await accept() }
            } label: {
                Group {
                    if busy { ProgressView().tint(.white) } else { Label("Acepto", systemImage: "checkmark") }
                }
                .frame(maxWidth: .infinity)
            }
            .primaryButton()
            .disabled(busy)
            if let onDecline {
                Button("Ahora no", action: onDecline).frame(maxWidth: .infinity).disabled(busy)
            }
        }
        .font(.body)
        .fixedSize(horizontal: false, vertical: true)
        .card()
    }

    private func bullet(_ text: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text("•")
            Text(text)
        }
    }

    private func accept() async {
        busy = true
        error = nil
        do {
            try await session.update(["ai_consent": true])
            cheer(.love, "¡Gracias! A ver qué comiste")
        } catch {
            self.error = error.localizedDescription
        }
        busy = false
    }
}
