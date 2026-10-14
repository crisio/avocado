import Foundation

/// Enlaces que abren la app en un lugar (desde el widget): avocado://nueva abre la cámara para registrar, avocado://avo el chat.
@Observable
final class AppRoute {
    static let shared = AppRoute()

    /// Pestaña a la que hay que ir (MainTabs la consume).
    var tab: AppTab?
    /// Abrir "Registrar comida" con la cámara (TodayView lo consume).
    var addMeal = false
    /// Código de invitación de una nutrióloga (avocado://invitar/CODIGO); ProfileView abre la confirmación.
    var inviteCode: String?

    func open(_ url: URL) {
        guard url.scheme == "avocado" else { return }
        switch url.host() {
        case "nueva":
            tab = .today
            addMeal = true
        case "avo":
            tab = .avo
        case "invitar":
            // Solo lo usa el paciente (la nutrióloga no tiene pestañas de paciente). El enlace https del QR
            // todavía no abre la app (faltan los universal links); por ahora sirve el esquema avocado://.
            let code = url.pathComponents.filter { $0 != "/" }.first?.trimmingCharacters(in: .whitespaces)
            if let code, !code.isEmpty {
                inviteCode = code.uppercased()
                tab = .profile
            }
        default:
            tab = .today
        }
    }
}
