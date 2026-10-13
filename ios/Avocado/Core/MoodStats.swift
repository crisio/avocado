import Foundation

/// Avisa a las vistas del día cuando se registra o borra un ánimo (para recargar sin esperar al sondeo).
@Observable
final class MoodsSignal {
    static let shared = MoodsSignal()
    private(set) var version = 0
    func bump() { version += 1 }
}

/// Horarios de la semana: primera y última comida (promedio), el hueco más largo del día y las comidas tarde.
struct TimingStats {
    let first: Date
    let last: Date
    let longest: (minutes: Double, from: Date)?
    let late: Int

    init?(meals: [Meal]) {
        let cal = Fmt.calendar
        let days = Dictionary(grouping: meals) { cal.startOfDay(for: $0.eatenDate) }.values.map { $0.map(\.eatenDate).sorted() }
        guard !days.isEmpty else { return nil }
        func minutes(_ d: Date) -> Double { Double(cal.component(.hour, from: d) * 60 + cal.component(.minute, from: d)) }
        func clock(_ m: Double) -> Date { cal.date(bySettingHour: Int(m) / 60, minute: Int(m) % 60, second: 0, of: .now) ?? .now }
        let avg = { (ns: [Double]) in ns.reduce(0, +) / Double(ns.count) }
        first = clock(avg(days.map { minutes($0.first!) }))
        last = clock(avg(days.map { minutes($0.last!) }))
        var best: (minutes: Double, from: Date)?
        for day in days where day.count > 1 {
            for i in 1..<day.count {
                let gap = day[i].timeIntervalSince(day[i - 1]) / 60
                if best == nil || gap > best!.minutes { best = (gap, day[i - 1]) }
            }
        }
        longest = best
        late = meals.filter { minutes($0.eatenDate) >= 21 * 60 }.count
    }

    static func duration(_ minutes: Double) -> String {
        let h = Int(minutes) / 60
        let m = Int(minutes.rounded()) % 60
        return h > 0 ? "\(h) h\(m > 0 ? " \(m) min" : "")" : "\(m) min"
    }
}

/// Ánimo de la semana: lo más frecuente, la energía promedio y cuántas veces iba con su plan.
struct MoodStats {
    let top: [(Feeling, Int)]
    let energy: Double?
    let onPlan: (yes: Int, total: Int)?

    init?(moods: [MoodEntry]) {
        guard !moods.isEmpty else { return nil }
        var counts: [Feeling: Int] = [:]
        for mood in moods { for f in mood.feelings { counts[f, default: 0] += 1 } }
        top = counts.sorted { $0.value > $1.value }.prefix(3).map { ($0.key, $0.value) }
        let energies = moods.compactMap(\.energy)
        energy = energies.isEmpty ? nil : Double(energies.reduce(0, +)) / Double(energies.count)
        let plans = moods.compactMap(\.onPlan)
        onPlan = plans.isEmpty ? nil : (plans.filter { $0 == .si }.count, plans.count)
    }
}
