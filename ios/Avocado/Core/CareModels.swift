import Foundation

// Lo que regresa la API de la nutrióloga (api/src/care.ts). Llaves en snake_case, convertidas al decodificar.

/// Metas de un paciente que le puso su nutrióloga.
struct CareGoals: Codable, Hashable {
    var dailyKcalGoal: Int?
    var goal: Goal?
    var proteinGGoal: Int?
    var carbsGGoal: Int?
    var fatGGoal: Int?
    var setByMe: Bool?

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        dailyKcalGoal = try c.decodeIfPresent(Int.self, forKey: .dailyKcalGoal)
        // Un objetivo que esta versión no conoce no rompe el tablero.
        goal = (try? c.decodeIfPresent(Goal.self, forKey: .goal)) ?? nil
        proteinGGoal = try c.decodeIfPresent(Int.self, forKey: .proteinGGoal)
        carbsGGoal = try c.decodeIfPresent(Int.self, forKey: .carbsGGoal)
        fatGGoal = try c.decodeIfPresent(Int.self, forKey: .fatGGoal)
        setByMe = try c.decodeIfPresent(Bool.self, forKey: .setByMe)
    }

    private enum CodingKeys: String, CodingKey {
        case dailyKcalGoal, goal, proteinGGoal, carbsGGoal, fatGGoal, setByMe
    }
}

struct CareAlert: Codable, Hashable {
    /// sin_registro, mal, fuera_plan o arriba_meta.
    var kind: String
    var text: String

    var isDanger: Bool { kind == "mal" }
}

/// Un paciente en el tablero de la nutrióloga.
struct CarePatient: Codable, Identifiable, Hashable {
    struct Today: Codable, Hashable {
        var consumed: Double
        var proteinG: Double
        var carbsG: Double
        var fatG: Double
        var meals: Int
    }

    struct LastMood: Codable, Hashable {
        var feelings: [String]
        var onPlan: String?
        var feltAt: String
    }

    struct StreakInfo: Codable, Hashable {
        var current: Int
        var loggedToday: Bool
    }

    struct Week: Codable, Hashable {
        struct Plan: Codable, Hashable {
            var yes: Int
            var total: Int
        }

        var daysLogged: Int
        var avgKcal: Double?
        var onPlan: Plan?
    }

    var id: String
    var email: String
    var fullName: String?
    var goals: CareGoals
    var today: Today
    var lastMealAt: String?
    var lastMood: LastMood?
    var streak: StreakInfo
    var week: Week
    var alerts: [CareAlert]

    var displayName: String { fullName?.isEmpty == false ? fullName! : email }
}

struct CareDashboard: Codable {
    var patients: [CarePatient]
}

struct CareInvite: Codable, Equatable {
    var code: String
    var url: String
}
