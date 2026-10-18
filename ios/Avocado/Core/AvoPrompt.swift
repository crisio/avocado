import Foundation

/// Una pregunta para Avo que llega de otra pantalla: la app abre la pestaña de Avo y el chat la manda sola, una vez.
@Observable
final class AvoPrompt {
    static let shared = AvoPrompt()

    var pending: String?
    /// Borrador para el campo de texto del chat: se escribe, pero no se manda.
    var draft: String?

    static let cheatMeal = "¿Qué comida libre (cheat meal) me recomiendas con mi saldo de la semana?"
    static let bulk = "¿Qué me recomiendas para completar lo que me falta de mi volumen?"

    func ask(_ text: String) { pending = text }
    func prefill(_ text: String) { draft = text }
}
