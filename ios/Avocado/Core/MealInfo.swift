import SwiftUI

/// Tipo de comida: el que detectó la IA o, si no hay, uno según la hora (igual que src/lib/meals.ts).
enum MealKind {
    case breakfast, lunch, dinner, snack

    var label: String {
        switch self {
        case .breakfast: "Desayuno"
        case .lunch: "Comida"
        case .dinner: "Cena"
        case .snack: "Snack"
        }
    }

    /// Fondo suave de la tarjeta.
    var tint: Color {
        switch self {
        case .breakfast: Color(hex: 0xFBEFC8)
        case .lunch: Color(hex: 0xF6E1CB)
        case .dinner: Color(hex: 0xDCEBD3)
        case .snack: Color(hex: 0xFADCD6)
        }
    }

    /// Color de su segmento en la barra de calorías.
    var color: Color {
        switch self {
        case .breakfast: Color(hex: 0xF2C14E)
        case .lunch: Color(hex: 0xD9A066)
        case .dinner: Color(hex: 0x8DBB6A)
        case .snack: Color(hex: 0xEE8E7E)
        }
    }

    static func from(aiType: String?, eatenAt: Date) -> MealKind {
        switch aiType {
        case "desayuno": return .breakfast
        case "comida": return .lunch
        case "cena": return .dinner
        case "snack", "bebida": return .snack
        default:
            let hour = Fmt.calendar.component(.hour, from: eatenAt)
            if hour < 11 { return .breakfast }
            if hour < 16 { return .lunch }
            if hour < 19 { return .snack }
            return .dinner
        }
    }
}

extension Meal {
    var eatenDate: Date { Fmt.date(eatenAt) }
    var kind: MealKind { MealKind.from(aiType: analysis?.mealType, eatenAt: eatenDate) }
    var meta: String { "\(Fmt.time(eatenDate)) · \(kind.label)" }

    var title: String {
        switch status {
        case .pending: "Analizando tu comida…"
        case .error: note?.isEmpty == false ? note! : "Comida sin analizar"
        case .analyzed: analysis?.summary?.isEmpty == false ? analysis!.summary! : "Comida"
        }
    }

    /// Calorías que se sirvieron, si no se comió todo (nil si se comió completo).
    var servedCalories: Double? {
        guard let served = analysis?.served?.calories, served - (calories ?? 0) >= 1 else { return nil }
        return served
    }

    /// "520 kcal · 32 g proteína", o "260 de 520 kcal · …" si sobró.
    var detail: String? {
        guard status == .analyzed else { return nil }
        let eaten = servedCalories.map { "\(Fmt.number(calories ?? 0)) de \(Fmt.kcal($0))" } ?? Fmt.kcal(calories)
        return "\(eaten) · \(Int((proteinG ?? 0).rounded())) g proteína"
    }

    /// Lo que dice Avo al terminar de analizar la comida: "¡Listo! 520 kcal", o su comentario de la foto si lo hay.
    func analyzedLine(own: Bool) -> String {
        let done = "¡Listo! \(Fmt.kcal(calories))"
        guard own, let text = analysis?.avo?.text.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty else { return done }
        // Igual que la web: con las kcal solo si el texto es corto.
        return text.count <= 60 ? "\(Fmt.kcal(calories)) · \(text)" : text
    }

    var consumed: Totals { Totals(calories: calories ?? 0, proteinG: proteinG ?? 0, carbsG: carbsG ?? 0, fatG: fatG ?? 0) }

    /// La misma comida con otras porciones: recalcula lo comido y lo servido como la API (para pintar al instante).
    func with(items: [AnalysisItem]) -> Meal {
        func sum(_ useEaten: Bool) -> Totals {
            var t = Totals.zero
            for item in items {
                let f = useEaten ? item.eatenFraction : 1
                t.calories += item.calories * f
                t.proteinG += item.proteinG * f
                t.carbsG += item.carbsG * f
                t.fatG += item.fatG * f
            }
            return t
        }
        var meal = self
        let total = sum(true)
        meal.analysis?.items = items
        meal.analysis?.total = total
        meal.analysis?.served = sum(false)
        meal.calories = total.calories
        meal.proteinG = total.proteinG
        meal.carbsG = total.carbsG
        meal.fatG = total.fatG
        return meal
    }
}
