import Foundation

/// Fechas, horas y números como los muestra la app web (español de México).
enum Fmt {
    static let locale = Locale(identifier: "es_MX")
    static var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.locale = locale
        calendar.firstWeekday = 2 // las semanas empiezan en lunes
        return calendar
    }

    private static let isoFraction: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
    private static let isoPlain = ISO8601DateFormatter()

    static func date(_ iso: String) -> Date { isoFraction.date(from: iso) ?? isoPlain.date(from: iso) ?? .distantPast }
    static func iso(_ date: Date) -> String { isoFraction.string(from: date) }

    private static let timeFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = locale
        formatter.timeStyle = .short
        return formatter
    }()
    private static let longFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = locale
        formatter.dateFormat = "EEEE d 'de' MMMM"
        return formatter
    }()
    private static let dayMonth: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = locale
        formatter.dateFormat = "d 'de' MMMM"
        return formatter
    }()
    private static let shortDayMonth: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = locale
        formatter.dateFormat = "d MMM"
        return formatter
    }()

    /// "2:30 p.m."
    static func time(_ date: Date) -> String { timeFormatter.string(from: date) }

    /// "Domingo 11 de octubre"
    static func longDate(_ date: Date) -> String { longFormatter.string(from: date).capitalizedFirst }

    /// "Hoy", "Ayer" o "Viernes 9 de octubre"
    static func day(_ date: Date) -> String {
        let diff = calendar.dateComponents([.day], from: startOfDay(.now), to: startOfDay(date)).day ?? 0
        if diff == 0 { return "Hoy" }
        if diff == -1 { return "Ayer" }
        return longDate(date)
    }

    /// "hace 5 min", "hace 2 h", "ayer" o la fecha
    static func ago(_ iso: String) -> String {
        let minutes = Int((Date.now.timeIntervalSince(date(iso)) / 60).rounded())
        if minutes < 1 { return "ahora" }
        if minutes < 60 { return "hace \(minutes) min" }
        let hours = Int((Double(minutes) / 60).rounded())
        if hours < 24 { return "hace \(hours) h" }
        return day(date(iso)).lowercased()
    }

    static func startOfDay(_ date: Date) -> Date { calendar.startOfDay(for: date) }
    static func addDays(_ date: Date, _ days: Int) -> Date { calendar.date(byAdding: .day, value: days, to: date)! }
    static func isToday(_ date: Date) -> Bool { calendar.isDateInToday(date) }

    /// Lunes de la semana de `date`.
    static func startOfWeek(_ date: Date) -> Date {
        let day = startOfDay(date)
        let weekday = calendar.component(.weekday, from: day) // 1 = domingo
        return addDays(day, -((weekday + 5) % 7))
    }

    /// "6 – 12 de octubre", o "29 sept – 5 oct" si cruza de mes.
    static func weekRange(_ start: Date) -> String {
        let end = addDays(start, 6)
        if calendar.component(.month, from: start) == calendar.component(.month, from: end) {
            return "\(calendar.component(.day, from: start)) – \(dayMonth.string(from: end))"
        }
        let short = { (d: Date) in shortDayMonth.string(from: d).replacingOccurrences(of: ".", with: "") }
        return "\(short(start)) – \(short(end))"
    }

    private static let numberFormatter: NumberFormatter = {
        let formatter = NumberFormatter()
        formatter.locale = locale
        formatter.numberStyle = .decimal
        formatter.maximumFractionDigits = 0
        return formatter
    }()

    /// "1,842"
    static func number(_ n: Double) -> String { numberFormatter.string(from: NSNumber(value: n.rounded())) ?? "\(Int(n.rounded()))" }
    static func kcal(_ n: Double?) -> String { "\(number(n ?? 0)) kcal" }
    static func grams(_ n: Double?) -> String { "\(Int((n ?? 0).rounded())) g" }

    static func days(_ n: Int) -> String { "\(n) \(n == 1 ? "día" : "días")" }
    static func daysInARow(_ n: Int) -> String { "\(n) \(n == 1 ? "día seguido" : "días seguidos")" }

    static func firstName(_ name: String?) -> String {
        (name ?? "").trimmingCharacters(in: .whitespaces).split(separator: " ").first.map(String.init) ?? ""
    }

    /// Minutos de diferencia con UTC, como Date.getTimezoneOffset() en la web (la API de rachas lo pide así).
    static var timezoneOffset: Int { -TimeZone.current.secondsFromGMT() / 60 }
}

extension String {
    var capitalizedFirst: String { prefix(1).uppercased() + dropFirst() }
}
