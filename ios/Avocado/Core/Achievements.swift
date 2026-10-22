import Foundation

/// Respuesta de GET /achievements: medallas, retos de la semana y accesorios de Avo.
struct AchievementsData: Decodable, Equatable {
    struct Medal: Decodable, Equatable, Identifiable {
        let key: String
        let emoji: String
        let title: String
        let description: String
        let group: String
        let progress: Int
        let target: Int
        let unlockedAt: String?
        var id: String { key }
        var unlocked: Bool { unlockedAt != nil }
    }
    struct Challenge: Decodable, Equatable, Identifiable {
        let key: String
        let emoji: String
        let title: String
        let description: String
        let progress: Int
        let target: Int
        let done: Bool
        let endsAt: String
        var id: String { key }
    }
    struct Accessory: Decodable, Equatable, Identifiable {
        let key: String
        let emoji: String
        let name: String
        let slot: String
        let unlocked: Bool
        let requirement: String
        var id: String { key }
    }
    struct Streak: Decodable, Equatable {
        let current: Int
        let best: Int
    }
    struct Summary: Decodable, Equatable {
        let unlocked: Int
        let total: Int
    }

    var medals: [Medal]
    var challenges: [Challenge]
    var accessories: [Accessory]
    var equipped: String?
    let streak: Streak
    let summary: Summary

    static let groups: [(key: String, title: String)] = [
        ("constancia", "Constancia"), ("registro", "Registro"), ("habitos", "Hábitos"), ("retos", "Retos"),
    ]

    static func load(userId: String? = nil) async -> AchievementsData? {
        var query = ["offset": String(Fmt.timezoneOffset)]
        if let userId { query["user_id"] = userId }
        return try? await APIClient.shared.request("GET", "/achievements", query: query)
    }
}

/// Logros de la persona que usa la app: se refresca al entrar, al volver y al subir una comida; celebra las medallas nuevas.
@Observable
final class Achievements {
    static let shared = Achievements()

    private(set) var data: AchievementsData?
    /// Medalla recién ganada que se está celebrando (una a la vez) y el accesorio que desbloqueó.
    private(set) var celebrating: AchievementsData.Medal?
    private(set) var unlockedAccessory: AchievementsData.Accessory?
    /// Accesorio puesto: se guarda para que Avo salga vestido desde que abre la app.
    private(set) var worn: (emoji: String, slot: String)?

    private var queue: [AchievementsData.Medal] = []
    private var userId = ""
    private var doneChallenges: Set<String>?
    private let defaults = UserDefaults.standard

    private var seenKey: String { "avocado.medalsSeen.\(userId)" }
    private var accessoriesKey: String { "avocado.accessoriesSeen.\(userId)" }
    private var wornKey: String { "avocado.avoWorn.\(userId)" }

    init() {
        if let id = Session.shared.user?.id {
            userId = id
            if let raw = defaults.string(forKey: wornKey) { worn = Self.parse(raw) }
        }
    }

    private static func parse(_ raw: String) -> (emoji: String, slot: String)? {
        let parts = raw.split(separator: "|", maxSplits: 1).map(String.init)
        return parts.count == 2 ? (parts[0], parts[1]) : nil
    }

    func refresh(userId id: String) async {
        if id != userId {
            userId = id
            data = nil
            doneChallenges = nil
            queue = []
            worn = defaults.string(forKey: wornKey).flatMap(Self.parse)
        }
        guard let next = await AchievementsData.load() else { return }
        data = next
        syncWorn(next)

        // Retos que se cumplieron desde la última vez.
        let done = Set(next.challenges.filter(\.done).map(\.key))
        if let before = doneChallenges, !done.subtracting(before).isEmpty { cheer(.celebrate, "¡Reto cumplido! 💪") }
        doneChallenges = done

        // Medallas nuevas: la primera vez solo se marcan como vistas.
        let dates = next.medals.compactMap { m in m.unlockedAt.map { (m, Fmt.date($0).timeIntervalSince1970) } }
        guard defaults.object(forKey: seenKey) != nil else {
            defaults.set(dates.map(\.1).max() ?? 0, forKey: seenKey)
            defaults.set(next.accessories.filter(\.unlocked).map(\.key), forKey: accessoriesKey)
            return
        }
        let seen = defaults.double(forKey: seenKey)
        let fresh = dates.filter { $0.1 > seen }.sorted { $0.1 < $1.1 }.map(\.0)
        let queued = Set(queue.map(\.key) + [celebrating?.key].compactMap { $0 })
        queue += fresh.filter { !queued.contains($0.key) }
        presentNext()
    }

    private func syncWorn(_ d: AchievementsData) {
        if let a = d.accessories.first(where: { $0.key == d.equipped }) {
            worn = (a.emoji, a.slot)
            defaults.set("\(a.emoji)|\(a.slot)", forKey: wornKey)
        } else {
            worn = nil
            defaults.removeObject(forKey: wornKey)
        }
    }

    private func presentNext() {
        guard celebrating == nil, !queue.isEmpty else { return }
        let medal = queue.removeFirst()
        let known = Set(defaults.stringArray(forKey: accessoriesKey) ?? [])
        unlockedAccessory = data?.accessories.first { $0.unlocked && !known.contains($0.key) }
        celebrating = medal
        cheer(.celebrate, AvoStyle.current == .picante ? "¡Mírate nomás! Ya hasta medalla tienes 😏" : "¡Felicidades! Te la ganaste 💚")
    }

    func dismissCelebration() {
        if let medal = celebrating, let at = medal.unlockedAt {
            defaults.set(max(defaults.double(forKey: seenKey), Fmt.date(at).timeIntervalSince1970), forKey: seenKey)
        }
        if let data { defaults.set(data.accessories.filter(\.unlocked).map(\.key), forKey: accessoriesKey) }
        celebrating = nil
        unlockedAccessory = nil
        presentNext()
    }

    /// Le pone (o le quita, con nil) un accesorio a Avo. Devuelve el error para mostrarlo, o nil si salió bien.
    @discardableResult
    func equip(_ key: String?) async -> String? {
        guard var current = data else { return nil }
        let before = current.equipped
        current.equipped = key
        data = current
        syncWorn(current)
        do {
            try await Session.shared.update(["avo_accessory": key ?? NSNull()])
            return nil
        } catch {
            current.equipped = before
            data = current
            syncWorn(current)
            return error.localizedDescription
        }
    }
}
