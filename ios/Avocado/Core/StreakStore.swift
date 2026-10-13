import Foundation

/// La racha (días seguidos registrando), para el fueguito de "Mi día", la semana y la celebración.
@Observable
final class StreakStore {
    static let shared = StreakStore()

    var streak: Streak?

    func load() async {
        if let fresh: Streak = try? await APIClient.shared.request("GET", "/streak", query: ["offset": String(Fmt.timezoneOffset)]) {
            streak = fresh
        }
    }

    /// Cómo queda la racha con una comida nueva de hoy (antes de que llegue al servidor).
    func afterNewMealToday() -> Int? {
        guard var current = streak else { return nil }
        if !current.loggedToday {
            current.current += 1
            current.best = max(current.best, current.current)
            current.loggedToday = true
            if !current.week.isEmpty { current.week[current.week.count - 1].logged = true }
            streak = current
        }
        return current.current
    }
}
