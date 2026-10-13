import Foundation

/**
 Lo que el widget muestra del día. La app lo guarda en el App Group cada vez que carga "Mi día" o la racha, y el widget
 lo lee (no tiene sesión ni habla con la API). Este archivo lo comparten la app y el widget.
 */
struct WidgetSnapshot: Codable, Equatable {
    /// Inicio del día al que corresponden los números (hora del teléfono).
    var day: Date
    var consumed: Double
    var goal: Double?
    var protein: Double
    var carbs: Double
    var fat: Double
    var meals: Int
    var streak: Int
    var loggedToday: Bool
    var name: String
    var updatedAt: Date

    static let appGroup = "group.com.cristopherpineda.avocado"
    static let widgetKind = "AvocadoToday"
    private static let key = "widget.snapshot"

    private static var store: UserDefaults? { UserDefaults(suiteName: appGroup) }

    static func load() -> WidgetSnapshot? {
        guard let data = store?.data(forKey: key) else { return nil }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try? decoder.decode(WidgetSnapshot.self, from: data)
    }

    func save() {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        Self.store?.set(try? encoder.encode(self), forKey: Self.key)
    }

    static func clear() {
        store?.removeObject(forKey: key)
    }

    static func empty(now: Date = .now, calendar: Calendar = .current) -> WidgetSnapshot {
        WidgetSnapshot(
            day: calendar.startOfDay(for: now), consumed: 0, goal: nil, protein: 0, carbs: 0, fat: 0,
            meals: 0, streak: 0, loggedToday: false, name: "", updatedAt: now
        )
    }

    /// Como se ve hoy: si los números son de otro día, el día empieza en cero. La racha sigue viva hasta que termine el
    /// día si ayer registró; si no, se perdió.
    func forToday(_ now: Date = .now, calendar: Calendar = .current) -> WidgetSnapshot {
        if calendar.isDate(day, inSameDayAs: now) { return self }
        var today = self
        today.day = calendar.startOfDay(for: now)
        today.consumed = 0
        today.protein = 0
        today.carbs = 0
        today.fat = 0
        today.meals = 0
        today.loggedToday = false
        let yesterday = calendar.date(byAdding: .day, value: -1, to: today.day) ?? today.day
        if !(loggedToday && calendar.isDate(day, inSameDayAs: yesterday)) { today.streak = 0 }
        return today
    }

    /// Para la galería de widgets y las vistas previas.
    static let sample = WidgetSnapshot(
        day: Calendar.current.startOfDay(for: .now), consumed: 1_240, goal: 2_200, protein: 74, carbs: 140, fat: 42,
        meals: 3, streak: 5, loggedToday: true, name: "Cris", updatedAt: .now
    )
}
