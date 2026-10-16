import Foundation

// Lo que regresa la API (api/src). Las llaves vienen en snake_case y se convierten a camelCase al decodificar.

enum Role: String, Codable {
    case patient, nutritionist
}

struct User: Codable, Equatable {
    var id: String
    var email: String
    var fullName: String?
    var role: Role?
    /// Meta diaria de calorías (opcional).
    var dailyKcalGoal: Int?
    /// Cuándo aceptó que sus fotos y notas se analicen con IA (nil = no ha aceptado).
    var aiConsentAt: String?
    /// Objetivo: bajar de peso, mantener o subir (volumen). Define la comida libre de la semana.
    var goal: Goal?
    /// Metas de macros en gramos (las pone su nutrióloga).
    var proteinGGoal: Int?
    var carbsGGoal: Int?
    var fatGGoal: Int?
    /// Quién puso las metas: si no es nil, las puso su nutrióloga y el paciente no las edita.
    var goalsSetBy: String?
    /// Personalidad de Avo. Los perfiles guardados de antes no la traen: cuenta como picante.
    var avoStyle: AvoStyle?
    /// Avisos a la hora de comer. Los perfiles guardados de antes no lo traen: cuenta como encendido.
    var reminders: Bool?

    var style: AvoStyle { avoStyle ?? .picante }
    var remindersOn: Bool { reminders ?? true }
}

/// Cómo habla Avo con el paciente. Mismos valores que la API (avo_style).
enum AvoStyle: String, Codable, CaseIterable, Identifiable {
    case picante, tranquilo

    var id: String { rawValue }
    var label: String {
        switch self {
        case .picante: "Picante 🌶️"
        case .tranquilo: "Tranquilo 😌"
        }
    }

    /// Un valor que esta versión no conoce no rompe el perfil: se toma como picante.
    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = AvoStyle(rawValue: raw) ?? .picante
    }

    /// El estilo de quien tiene la sesión abierta (picante si aún no se sabe; la nutrióloga siempre ve el tranquilo).
    static var current: AvoStyle {
        guard let user = Session.shared.user, user.role != .nutritionist else { return .tranquilo }
        return user.style
    }
}

/// GIF de reacción de GIPHY que acompaña lo que dice Avo.
struct Gif: Codable, Equatable {
    var id: String
    /// WebP animado.
    var webp: String
    var mp4: String
    /// Primer cuadro (imagen fija).
    var still: String
    var width: Int
    var height: Int
    var title: String
}

/// Lo que Avo dice de una comida (solo en los análisis nuevos).
struct AvoNote: Codable, Equatable {
    var text: String
    var gif: Gif?
}

enum Goal: String, Codable, CaseIterable, Identifiable {
    case bajar, mantener, subir

    var id: String { rawValue }
    var label: String {
        switch self {
        case .bajar: "Bajar"
        case .mantener: "Mantener"
        case .subir: "Subir"
        }
    }
}

/// Saldo de los últimos 7 días (sin hoy) y comida libre de hoy. Ver api/src/budget.ts.
struct Budget: Codable, Equatable {
    struct Day: Codable, Equatable {
        var date: String
        var consumed: Double
        var meals: Int
        var counted: Bool
    }

    var goal: Goal?
    var dailyKcalGoal: Double
    var days: [Day]
    /// Positivo = quedó por debajo de la meta en los días que cuentan.
    var balance: Double
    /// Días incompletos (menos de 60 % de la meta registrada) que no cuentan.
    var skipped: Int
    var todayConsumed: Double
    /// Kcal extra para hoy: comida libre (bajar/mantener) o lo que conviene completar (subir).
    var extra: Double
    var todayBudget: Double
}

struct Person: Codable, Identifiable, Hashable {
    var id: String
    var email: String
    var fullName: String?

    var displayName: String { fullName?.isEmpty == false ? fullName! : email }
}

struct Totals: Codable, Equatable {
    var calories: Double
    var proteinG: Double
    var carbsG: Double
    var fatG: Double

    static let zero = Totals(calories: 0, proteinG: 0, carbsG: 0, fatG: 0)

    init(calories: Double, proteinG: Double, carbsG: Double, fatG: Double) {
        self.calories = calories
        self.proteinG = proteinG
        self.carbsG = carbsG
        self.fatG = fatG
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        calories = try c.decodeIfPresent(Double.self, forKey: .calories) ?? 0
        proteinG = try c.decodeIfPresent(Double.self, forKey: .proteinG) ?? 0
        carbsG = try c.decodeIfPresent(Double.self, forKey: .carbsG) ?? 0
        fatG = try c.decodeIfPresent(Double.self, forKey: .fatG) ?? 0
    }

    private enum CodingKeys: String, CodingKey {
        case calories, proteinG, carbsG, fatG
    }
}

struct AnalysisItem: Codable, Equatable {
    var name: String
    /// Valores de la porción completa servida.
    var portionG: Double
    var calories: Double
    var proteinG: Double
    var carbsG: Double
    var fatG: Double
    /// Fracción que se comió (1 = todo). Los análisis viejos no la traen: cuenta como 1.
    var eaten: Double?

    var eatenFraction: Double { eaten ?? 1 }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        name = try c.decodeIfPresent(String.self, forKey: .name) ?? "Alimento"
        portionG = try c.decodeIfPresent(Double.self, forKey: .portionG) ?? 0
        calories = try c.decodeIfPresent(Double.self, forKey: .calories) ?? 0
        proteinG = try c.decodeIfPresent(Double.self, forKey: .proteinG) ?? 0
        carbsG = try c.decodeIfPresent(Double.self, forKey: .carbsG) ?? 0
        fatG = try c.decodeIfPresent(Double.self, forKey: .fatG) ?? 0
        eaten = try c.decodeIfPresent(Double.self, forKey: .eaten)
    }

    private enum CodingKeys: String, CodingKey {
        case name, portionG, calories, proteinG, carbsG, fatG, eaten
    }
}

struct Analysis: Codable, Equatable {
    var items: [AnalysisItem]?
    /// Lo que se comió.
    var total: Totals?
    /// Lo que se sirvió (sin restar lo que sobró).
    var served: Totals?
    /// Última corrección del paciente ("me dejé la mitad…").
    var correction: String?
    var mealType: String?
    var summary: String?
    var confidence: Double?
    var model: String?
    var error: String?
    /// Lo que Avo dice de esta foto.
    var avo: AvoNote?
}

struct LastComment: Codable, Equatable {
    var body: String
    var authorName: String?
    var authorRole: Role?
    var createdAt: String
}

struct MealComment: Codable, Identifiable, Equatable {
    var id: String
    var mealId: String
    var authorId: String
    var body: String
    var createdAt: String
    var authorName: String?
    var authorRole: Role?
}

enum MealStatus: String, Codable {
    case pending, analyzed, error
}

struct Meal: Codable, Identifiable, Equatable {
    var id: String
    var userId: String
    var eatenAt: String
    var photoUrl: String
    var note: String?
    var status: MealStatus
    var analysis: Analysis?
    var calories: Double?
    var proteinG: Double?
    var carbsG: Double?
    var fatG: Double?
    var createdAt: String
    /// Comentario más reciente (solo en la lista del día).
    var lastComment: LastComment?
    /// Comentarios (solo en el detalle).
    var comments: [MealComment]?
}

/// Consejo de Avo para un antojo ("¿Me lo como?"). No se guarda.
struct Craving: Codable, Equatable {
    struct Today: Codable, Equatable {
        var consumed: Double
        var meals: Int
        /// Comidas de hoy que aún no tienen calorías (analizándose, sin análisis o en el teléfono).
        var pending: Int
        var goal: Double?
        var remaining: Double?
    }

    var name: String
    var portionG: Double
    /// De la porción completa de la foto.
    var calories: Double
    var proteinG: Double
    var carbsG: Double
    var fatG: Double
    var verdict: String
    /// Fracción que conviene comer (1 = todo).
    var suggestedFraction: Double
    var suggestedCalories: Double
    var message: String
    var tips: [String]
    var question: String?
    var confidence: Double
    var today: Today
    var gif: Gif?

    /// Avo dijo que la foto no es comida (o no supo qué es).
    var isNotFood: Bool { name.isEmpty && calories == 0 }
}

struct Streak: Codable, Equatable {
    struct Day: Codable, Equatable {
        var date: String
        var logged: Bool
    }

    var current: Int
    var best: Int
    var loggedToday: Bool
    var today: String
    /// Últimos 7 días, de hace 6 días a hoy.
    var week: [Day]
}

/// Cómo se siente el paciente. Misma lista y orden que la API (api/src/moods.ts) y la web (src/lib/moods.ts).
enum Feeling: String, Codable, CaseIterable, Identifiable {
    case bien
    case conHambre = "con_hambre"
    case conAntojo = "con_antojo"
    case lleno, ansioso, cansado, mal

    var id: String { rawValue }

    var emoji: String {
        switch self {
        case .bien: "😊"
        case .conHambre: "🍽️"
        case .conAntojo: "🍩"
        case .lleno: "😮‍💨"
        case .ansioso: "😬"
        case .cansado: "😴"
        case .mal: "🤢"
        }
    }

    /// Texto bajo el emoji en la fila de "¿Cómo te sientes?" (cabe en un séptimo de la pantalla).
    var short: String {
        switch self {
        case .bien: "Bien"
        case .conHambre: "Hambre"
        case .conAntojo: "Antojo"
        case .lleno: "Lleno"
        case .ansioso: "Ansioso"
        case .cansado: "Cansado"
        case .mal: "Mal"
        }
    }

    var label: String {
        switch self {
        case .bien: "Bien"
        case .conHambre: "Con hambre"
        case .conAntojo: "Con antojo"
        case .lleno: "Lleno/a"
        case .ansioso: "Ansioso/a"
        case .cansado: "Sin energía"
        case .mal: "Mal"
        }
    }
}

/// ¿Va con el plan de su nutrióloga?
enum OnPlan: String, Codable, CaseIterable, Identifiable {
    case si
    case aMedias = "a_medias"
    case no

    var id: String { rawValue }
    var label: String {
        switch self {
        case .si: "Sí"
        case .aMedias: "A medias"
        case .no: "No"
        }
    }
    func summary(own: Bool) -> String {
        switch self {
        case .si: own ? "Vas con tu plan" : "Va con su plan"
        case .aMedias: own ? "A medias con tu plan" : "A medias con su plan"
        case .no: own ? "Fuera de tu plan" : "Fuera de su plan"
        }
    }
}

struct MoodAdvice: Codable, Equatable {
    var message: String
    var tips: [String]
    var gif: Gif?
}

/// Un registro de cómo se siente (lo ve su nutrióloga).
struct MoodEntry: Codable, Identifiable, Equatable {
    var id: String
    var userId: String
    var feltAt: String
    var feelings: [Feeling]
    /// 1 (nada) a 5 (a tope).
    var energy: Int?
    var onPlan: OnPlan?
    var note: String?
    /// La comida después de la que lo registró.
    var mealId: String?
    /// Consejo de Avo (solo con permiso para la IA).
    var advice: MoodAdvice?

    var feltDate: Date { Fmt.date(feltAt) }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        userId = try c.decode(String.self, forKey: .userId)
        feltAt = try c.decode(String.self, forKey: .feltAt)
        // Un sentimiento nuevo que esta versión no conoce no rompe la lista.
        feelings = (try c.decodeIfPresent([String].self, forKey: .feelings) ?? []).compactMap(Feeling.init(rawValue:))
        energy = try c.decodeIfPresent(Int.self, forKey: .energy)
        onPlan = try? c.decodeIfPresent(OnPlan.self, forKey: .onPlan)
        note = try c.decodeIfPresent(String.self, forKey: .note)
        mealId = try c.decodeIfPresent(String.self, forKey: .mealId)
        advice = try? c.decodeIfPresent(MoodAdvice.self, forKey: .advice)
    }

    private enum CodingKeys: String, CodingKey {
        case id, userId, feltAt, feelings, energy, onPlan, note, mealId, advice
    }
}

/// Patrones de comida y ánimo que encuentra Avo (no se guardan).
struct Insights: Codable, Equatable {
    struct Pattern: Codable, Equatable {
        var title: String
        var detail: String
    }

    var summary: String
    var patterns: [Pattern]
    var suggestions: [String]
}

/// Un mensaje de la conversación con Avo (privada; lo que anota de ánimo lo ve su nutrióloga).
struct AvoMessage: Codable, Identifiable, Equatable {
    enum Role: String, Codable { case user, avo }

    var id: String
    var role: Role
    var body: String
    /// Lo dijo en un audio (body es la transcripción).
    var viaAudio: Bool
    var createdAt: String
    /// Lo que Avo anotó de cómo se siente con este mensaje.
    var mood: MoodEntry?
    var gif: Gif?
}

struct AvoReply: Codable {
    var user: AvoMessage
    var avo: AvoMessage
    var mood: MoodEntry?
}
