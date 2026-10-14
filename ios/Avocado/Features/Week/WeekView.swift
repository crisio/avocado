import Charts
import SwiftUI

/// "Tu semana" (lunes a domingo): racha, calorías por día, promedio, macros y lo que más comiste.
/// Con `userId` es la semana de un paciente, vista por su nutrióloga (en tercera persona).
struct WeekView: View {
    var userId: String?
    /// Metas del paciente (la nutrióloga las ve en la gráfica y en los macros).
    var goals: CareGoals?
    /// Nombre de pila del paciente, para el encabezado.
    var patientName: String?

    @Environment(Session.self) private var session
    @Environment(StreakStore.self) private var streaks
    @Environment(Outbox.self) private var outbox
    @State private var start = Fmt.startOfWeek(.now)
    @State private var meals: [Meal]?
    @State private var loadedStart: Date?
    @State private var error: String?
    @State private var patientStreak: Streak?

    private var own: Bool { userId == nil }
    private var streak: Streak? { own ? streaks.streak : patientStreak }

    private var isCurrent: Bool { start == Fmt.startOfWeek(.now) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                PageHeader(eyebrow: patientName.flatMap { $0.isEmpty ? nil : "\($0) · \(Fmt.weekRange(start))" } ?? Fmt.weekRange(start), title: own ? "Tu semana" : "Su semana") {
                    MascotView(mood: .idle, size: 80, reactive: true, bubbleEdge: .bottom)
                }
                DayNav(
                    label: isCurrent ? "Esta semana" : Fmt.weekRange(start),
                    onPrev: { start = Fmt.addDays(start, -7) },
                    onNext: { start = Fmt.addDays(start, 7) },
                    nextDisabled: isCurrent
                )
                if isCurrent, let streak { StreakCard(streak: streak, own: own) }
                if isCurrent { WeekBudgetCard(reloadKey: outbox.syncedCount, userId: userId) }

                if loadedStart == start, let meals {
                    summary(WeekStats(meals: meals, start: start))
                } else if let error {
                    Notice(text: error, tone: .warning)
                } else {
                    ProgressView().frame(maxWidth: .infinity).padding(.vertical, 40)
                }
            }
            .padding(.horizontal, Theme.gutter)
            .padding(.bottom, 32)
        }
        .screenBackground()
        .refreshable {
            await load()
            if own { await streaks.load() } else { await loadPatientStreak() }
        }
        .toolbar(own ? .hidden : .automatic, for: .navigationBar)
        .navigationBarTitleDisplayMode(.inline)
        .mealDestinations()
        .task(id: userId) { if !own { await loadPatientStreak() } }
        .task(id: "\(start.timeIntervalSince1970)-\(outbox.syncedCount)") { await load() }
    }

    @ViewBuilder private func summary(_ stats: WeekStats) -> some View {
        let goal = own ? session.user?.dailyKcalGoal : goals?.dailyKcalGoal

        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(Fmt.number(stats.average.calories)).font(.display(40, weight: 800, relativeTo: .largeTitle))
                Text("kcal al día en promedio").font(.subheadline.weight(.semibold)).foregroundStyle(Theme.muted)
            }
            Text(stats.logged == 0 ? "Sin comidas analizadas esta semana." : "\(own ? "Registraste" : "Registró") \(Fmt.days(stats.logged)) de \(stats.elapsed).")
                .font(.subheadline)
                .foregroundStyle(Theme.muted)
            Chart {
                ForEach(stats.days) { day in
                    BarMark(x: .value("Día", day.short), y: .value("kcal", day.calories))
                        .foregroundStyle(day.isToday ? Theme.accent : Theme.accent.opacity(0.55))
                        .cornerRadius(6)
                }
                if let goal {
                    RuleMark(y: .value("Meta", goal))
                        .lineStyle(StrokeStyle(lineWidth: 1.5, dash: [5, 4]))
                        .foregroundStyle(Theme.orange)
                        .annotation(position: .top, alignment: .trailing) {
                            Text("Meta").font(.caption2.weight(.semibold)).foregroundStyle(Theme.orange)
                        }
                }
            }
            .frame(height: 180)
            .accessibilityLabel("Calorías por día")
        }
        .card()

        if let userId = userId ?? session.user?.id {
            PatternsCard(userId: userId, start: start, meals: meals ?? [], own: own)
        }

        SectionTitle("Promedio de macros al día")
        MacroChips(
            protein: stats.average.proteinG, carbs: stats.average.carbsG, fat: stats.average.fatG,
            proteinGoal: own ? session.user?.proteinGGoal : goals?.proteinGGoal,
            carbsGoal: own ? session.user?.carbsGGoal : goals?.carbsGGoal,
            fatGoal: own ? session.user?.fatGGoal : goals?.fatGGoal
        )

        if !stats.topFoods.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                SectionTitle(own ? "Lo que más comiste" : "Lo que más comió")
                ForEach(stats.topFoods, id: \.name) { food in
                    HStack {
                        Text(food.name).font(.body)
                        Spacer()
                        Text(food.count == 1 ? "1 vez" : "\(food.count) veces").font(.subheadline).foregroundStyle(Theme.muted)
                    }
                }
            }
            .card()
        }

        SectionTitle("Día por día")
        VStack(spacing: 0) {
            ForEach(stats.days.filter { !$0.future }.reversed()) { day in
                NavigationLink(value: DayRoute(day: day.date, userId: userId, goals: goals)) {
                    HStack {
                        Text(day.long).font(.body).foregroundStyle(Theme.ink)
                        Spacer()
                        Text(day.meals == 0 ? "Sin comidas" : "\(Fmt.kcal(day.calories)) · \(day.meals) \(day.meals == 1 ? "comida" : "comidas")")
                            .font(.subheadline)
                            .foregroundStyle(Theme.muted)
                        Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(Theme.muted.opacity(0.6))
                    }
                    .padding(.vertical, 12)
                    .contentShape(.rect)
                }
                .buttonStyle(.plain)
                Divider()
            }
        }
        .padding(.horizontal, 16)
        .background(Theme.surface, in: .rect(cornerRadius: Theme.radius))
    }

    private func loadPatientStreak() async {
        guard let userId else { return }
        if let fresh: Streak = try? await APIClient.shared.request("GET", "/streak", query: ["user_id": userId, "offset": String(Fmt.timezoneOffset)]) {
            patientStreak = fresh
        }
    }

    private func load() async {
        let requested = start
        do {
            let fresh: [Meal] = try await APIClient.shared.request(
                "GET", "/meals",
                query: ["user_id": userId ?? session.user?.id ?? "", "from": Fmt.iso(requested), "to": Fmt.iso(Fmt.addDays(requested, 7))]
            )
            guard requested == start else { return }
            meals = fresh
            loadedStart = requested
            error = nil
        } catch is CancellationError {
        } catch {
            if requested == start { self.error = error.localizedDescription }
        }
    }
}

/// Cuentas de la semana (solo comidas analizadas, como la web).
struct WeekStats {
    struct Day: Identifiable {
        let id: Int
        let date: Date
        let calories: Double
        let meals: Int
        let future: Bool
        let isToday: Bool
        var short: String { ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"][id] }
        var long: String { Fmt.day(date) }
    }

    let days: [Day]
    let logged: Int
    let elapsed: Int
    let average: Totals
    let topFoods: [(name: String, count: Int)]

    init(meals all: [Meal], start: Date) {
        let meals = all.filter { $0.status == .analyzed }
        let today = Fmt.startOfDay(.now)
        days = (0..<7).map { i in
            let date = Fmt.addDays(start, i)
            let next = Fmt.addDays(date, 1)
            let dayMeals = meals.filter { $0.eatenDate >= date && $0.eatenDate < next }
            return Day(id: i, date: date, calories: dayMeals.reduce(0) { $0 + ($1.calories ?? 0) }, meals: dayMeals.count, future: date > today, isToday: date == today)
        }
        let loggedDays = days.filter { $0.meals > 0 }.count
        logged = loggedDays
        elapsed = days.filter { !$0.future }.count
        let per = { (n: Double) in loggedDays > 0 ? n / Double(loggedDays) : 0 }
        let total = meals.reduce(Totals.zero) { acc, m in
            Totals(calories: acc.calories + (m.calories ?? 0), proteinG: acc.proteinG + (m.proteinG ?? 0), carbsG: acc.carbsG + (m.carbsG ?? 0), fatG: acc.fatG + (m.fatG ?? 0))
        }
        average = Totals(calories: per(total.calories), proteinG: per(total.proteinG), carbsG: per(total.carbsG), fatG: per(total.fatG))

        // Alimentos más frecuentes (por nombre normalizado; se muestra el nombre como más se escribió).
        var foods: [String: (names: [String: Int], meals: Set<String>)] = [:]
        for meal in meals {
            for item in meal.analysis?.items ?? [] where item.eatenFraction > 0 {
                let key = Self.foodKey(item.name)
                guard !key.isEmpty else { continue }
                var food = foods[key] ?? ([:], [])
                food.meals.insert(meal.id)
                food.names[item.name, default: 0] += 1
                foods[key] = food
            }
        }
        topFoods = foods.values
            .filter { $0.meals.count > 1 || foods.count <= 5 }
            .sorted { $0.meals.count > $1.meals.count }
            .prefix(5)
            .map { (name: $0.names.max { $0.value < $1.value }!.key, count: $0.meals.count) }
    }

    /// "Tortillas de maíz" y "tortilla de maiz" cuentan como el mismo alimento.
    static func foodKey(_ name: String) -> String {
        let plain = name.lowercased().folding(options: .diacriticInsensitive, locale: Fmt.locale)
        let cleaned = String(plain.map { $0.isLetter && $0.isASCII || $0.isNumber ? $0 : " " })
        return cleaned.split(separator: " ").map { singular(String($0)) }.joined(separator: " ")
    }

    /// Quita la "s" final y, después de l/n/r/d/z/j, también la "e" (frijoles → frijol, panes → pan).
    private static func singular(_ word: String) -> String {
        var base = word.count > 3 && word.hasSuffix("s") ? String(word.dropLast()) : word
        if base.count > 3, base.hasSuffix("e"), let before = base.dropLast().last, "lnrdzj".contains(before) { base.removeLast() }
        return base
    }
}

/// La racha: la actual, la mejor y los fueguitos de los últimos 7 días.
struct StreakCard: View {
    let streak: Streak
    /// false = texto en tercera persona.
    var own = true

    private static let milestones = [3, 7, 14, 30, 60, 100, 200, 365]
    private static let initials = ["D", "L", "M", "M", "J", "V", "S"]

    var body: some View {
        let next = Self.milestones.first { $0 > streak.current }
        let hint = own
            ? (streak.current == 0 ? "Registra una comida hoy y empieza tu racha."
                : !streak.loggedToday ? "Registra algo hoy para llegar a \(Fmt.days(streak.current + 1))."
                : next.map { "Te faltan \(Fmt.days($0 - streak.current)) para llegar a \($0)." } ?? "¡Racha legendaria!")
            : (streak.current == 0 ? "Aún no empieza su racha."
                : !streak.loggedToday ? "Todavía no registra nada hoy."
                : next.map { "Le faltan \(Fmt.days($0 - streak.current)) para llegar a \($0)." } ?? "¡Racha legendaria!")

        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 14) {
                Flame(lit: streak.current > 0, size: 50)
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(Text("\(streak.current)").font(.display(34, weight: 800))) \(Text(streak.current == 1 ? "día seguido" : "días seguidos").font(.headline))")
                    Text("\(own ? "Tu" : "Su") mejor racha: \(Fmt.days(streak.best))").font(.subheadline).foregroundStyle(Theme.muted)
                }
            }
            HStack {
                ForEach(Array(streak.week.enumerated()), id: \.offset) { index, day in
                    let date = Fmt.date("\(day.date)T12:00:00Z")
                    let weekday = Fmt.calendar.component(.weekday, from: date) - 1
                    VStack(spacing: 4) {
                        Flame(lit: day.logged, size: 22)
                        Text(Self.initials[weekday])
                            .font(.caption.weight(index == streak.week.count - 1 ? .bold : .regular))
                            .foregroundStyle(index == streak.week.count - 1 ? Theme.ink : Theme.muted)
                    }
                    .frame(maxWidth: .infinity)
                }
            }
            Text(hint).font(.subheadline).foregroundStyle(Theme.ink)
        }
        .card()
        .accessibilityElement(children: .combine)
    }
}
