import Foundation

/// Enlaces que abren la app en un lugar (desde el widget): avocado://nueva abre la cámara para registrar, avocado://avo el chat.
@Observable
final class AppRoute {
    static let shared = AppRoute()

    /// Pestaña a la que hay que ir (MainTabs la consume).
    var tab: AppTab?
    /// Abrir "Registrar comida" con la cámara (TodayView lo consume).
    var addMeal = false

    func open(_ url: URL) {
        guard url.scheme == "avocado" else { return }
        switch url.host() {
        case "nueva":
            tab = .today
            addMeal = true
        case "avo":
            tab = .avo
        default:
            tab = .today
        }
    }
}
