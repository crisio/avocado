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
        VStack(spacing: 16) {
            MascotView(mood: .think, size: 120, hd: true)
            Text("Para calcular tus calorías, Avo necesita ver tus fotos")
                .font(.display(24, relativeTo: .title2))
                .foregroundStyle(Theme.ink)
                .multilineTextAlignment(.center)
            Text("Tu foto y tu nota se mandan a una IA de Google (Gemini) u OpenAI, vía OpenRouter, solo para estimar la comida. Tu correo no se manda.")
                .font(.subheadline)
                .foregroundStyle(Theme.muted)
                .multilineTextAlignment(.center)
            VStack(alignment: .leading, spacing: 10) {
                Text("📸 Le tomas foto a tu plato y en segundos ves calorías y macros")
                Text("🔒 No usamos tus datos para publicidad ni los vendemos")
                Text("↩️ Puedes quitar el permiso cuando quieras en Perfil")
            }
            .font(.body)
            .foregroundStyle(Theme.ink)
            .frame(maxWidth: .infinity, alignment: .leading)
            if let error { Notice(text: error, tone: .danger) }
            Button {
                Task { await accept() }
            } label: {
                Group {
                    if busy { ProgressView().tint(.white) } else { Text("Sí, que Avo vea mis fotos") }
                }
                .frame(maxWidth: .infinity)
            }
            .primaryButton()
            .disabled(busy)
            if let onDecline {
                Button("Ahora no", action: onDecline).frame(maxWidth: .infinity).disabled(busy)
            }
            PrivacyLink()
        }
        .fixedSize(horizontal: false, vertical: true)
        .card()
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
