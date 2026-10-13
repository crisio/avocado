import Foundation
import WidgetKit

/// Le pasa al widget los números del día (App Group) y le pide redibujarse.
enum WidgetSync {
    /// Lo de hoy, cada vez que "Mi día" carga las comidas de hoy.
    static func today(consumed: Double, protein: Double, carbs: Double, fat: Double, meals: Int) {
        var s = current()
        s.consumed = consumed
        s.protein = protein
        s.carbs = carbs
        s.fat = fat
        s.meals = meals
        if meals > 0 { s.loggedToday = true }
        save(s)
    }

    static func streak(_ streak: Streak) {
        var s = current()
        s.streak = streak.current
        s.loggedToday = streak.loggedToday
        save(s)
    }

    /// Comida recién registrada (aunque siga en el teléfono): la racha de hoy ya cuenta.
    static func mealRegistered(streak: Int?) {
        var s = current()
        s.meals += 1
        s.loggedToday = true
        if let streak { s.streak = streak }
        save(s)
    }

    static func clear() {
        WidgetSnapshot.clear()
        WidgetCenter.shared.reloadTimelines(ofKind: WidgetSnapshot.widgetKind)
    }

    private static func current() -> WidgetSnapshot {
        (WidgetSnapshot.load() ?? .empty(calendar: Fmt.calendar)).forToday(calendar: Fmt.calendar)
    }

    private static func save(_ snapshot: WidgetSnapshot) {
        var s = snapshot
        let user = Session.shared.user
        s.goal = user?.dailyKcalGoal.map(Double.init)
        s.name = Fmt.firstName(user?.fullName)
        s.updatedAt = .now
        guard s != WidgetSnapshot.load() else { return }
        s.save()
        WidgetCenter.shared.reloadTimelines(ofKind: WidgetSnapshot.widgetKind)
    }
}
