import Foundation

/// Respuesta de GET /fasting: plan, ayuno en curso, ventana de comida e historial.
struct FastingStatus: Decodable, Equatable {
    struct Plan: Decodable, Equatable {
        let hours: Int
        let eatingStart: String
        let eatingEnd: String
        let label: String
    }
    struct Current: Decodable, Equatable {
        let startedAt: String?
        let hours: Double
        let goalHours: Double?
        let reached: Bool
    }
    struct Window: Decodable, Equatable {
        let opensAt: String
        let closesAt: String
    }
    struct Entry: Decodable, Equatable, Identifiable {
        let start: String
        let end: String
        let hours: Double
        let met: Bool?
        var id: String { start }
    }
    struct Stats: Decodable, Equatable {
        let longestHours: Double
        let averageHours: Double
        let metLast7: Int
    }

    let plan: Plan?
    let current: Current
    let state: String?
    let window: Window?
    let history: [Entry]
    let stats: Stats

    var isFasting: Bool { state == "ayuno" }

    static func load(userId: String? = nil) async -> FastingStatus? {
        var query = ["offset": String(Fmt.timezoneOffset)]
        if let userId { query["user_id"] = userId }
        return try? await APIClient.shared.request("GET", "/fasting", query: query)
    }

    /// "12:00" → "12:00 p. m."
    static func clock(_ hhmm: String) -> String {
        let parts = hhmm.split(separator: ":").compactMap { Int($0) }
        guard parts.count >= 2,
              let date = Fmt.calendar.date(bySettingHour: parts[0], minute: parts[1], second: 0, of: .now) else { return hhmm }
        return Fmt.time(date)
    }

    /// "14 h 22 min"
    static func duration(_ hours: Double) -> String {
        let total = max(0, Int((hours * 60).rounded(.down)))
        return "\(total / 60) h \(total % 60) min"
    }

    /// "15.2"
    static func oneDecimal(_ n: Double) -> String { String(format: "%.1f", locale: Fmt.locale, n) }
}
