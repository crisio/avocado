import SwiftUI

/// "Mi día": saludo, racha, resumen de calorías y las comidas del día (con las que siguen en el teléfono).
struct TodayView: View {
    let showWeek: () -> Void

    @Environment(Session.self) private var session
    @Environment(Outbox.self) private var outbox
    @Environment(StreakStore.self) private var streaks
    @State private var day = Fmt.startOfDay(.now)
    @State private var adding = false
    @State private var addWithCamera = false
    @State private var route = AppRoute.shared
    @State private var greeted = false
    @State private var reloads = 0

    private var name: String { Fmt.firstName(session.user?.fullName) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                PageHeader(eyebrow: Fmt.longDate(.now), title: name.isEmpty ? "Hola" : "Hola, \(name)") {
                    MascotView(mood: outbox.jobs.isEmpty ? (MascotView.isNight() ? .sleepy : .idle) : .think, size: 88, reactive: true, bubbleEdge: .bottom)
                }
                if let streak = streaks.streak {
                    Button(action: showWeek) { StreakChip(streak: streak) }.buttonStyle(.plain)
                }
                if let userId = session.user?.id {
                    DayMealsView(userId: userId, day: $day, reloadKey: reloads) {
                        MoodCheckInView()
                        CravingLink()
                    }
                }
            }
            .padding(.horizontal, Theme.gutter)
            .padding(.bottom, 96)
        }
        .screenBackground()
        .refreshable {
            reloads += 1
            await streaks.load()
        }
        .safeAreaInset(edge: .bottom) {
            Button {
                adding = true
            } label: {
                Label("Registrar comida", systemImage: "camera.fill").font(.headline).frame(maxWidth: .infinity)
            }
            .primaryButton()
            .padding(.horizontal, Theme.gutter)
            .padding(.bottom, 8)
        }
        .sheet(isPresented: $adding, onDismiss: { addWithCamera = false }) { AddMealView(startWithCamera: addWithCamera) }
        // Desde el widget: abre "Registrar comida" con la cámara.
        .onChange(of: route.addMeal, initial: true) {
            guard route.addMeal else { return }
            route.addMeal = false
            addWithCamera = true
            adding = true
        }
        .toolbar(.hidden, for: .navigationBar)
        .mealDestinations()
        .navigationDestination(for: CravingRoute.self) { _ in CravingView() }
        .task(id: outbox.syncedCount) { await streaks.load() }
        .task {
            guard !greeted else { return }
            greeted = true
            try? await Task.sleep(for: .milliseconds(500))
            let (mood, message) = MascotView.greeting(name)
            cheer(mood, message)
        }
    }
}

/// Fueguito con la racha, debajo del saludo.
struct StreakChip: View {
    let streak: Streak

    var body: some View {
        let text: String =
            streak.current == 0 ? "Empieza tu racha hoy"
            : streak.loggedToday ? Fmt.daysInARow(streak.current)
            : "\(Fmt.days(streak.current)) · ¡registra hoy para seguir!"
        HStack(spacing: 6) {
            Flame(lit: streak.loggedToday, size: 20)
            Text(text).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.ink)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(streak.loggedToday ? Theme.warningSoft : Theme.surface, in: .capsule)
        .accessibilityLabel("Racha: \(text). Ver tu semana.")
    }
}

struct CravingRoute: Hashable {}

/// "¿Tienes un antojo?" → ¿Me lo como?
struct CravingLink: View {
    var body: some View {
        NavigationLink(value: CravingRoute()) {
            HStack(spacing: 12) {
                MascotView(mood: .eat, size: 52, pose: 3)
                VStack(alignment: .leading, spacing: 2) {
                    Text("¿Tienes un antojo?").font(.headline).foregroundStyle(Theme.ink)
                    Text("Tómale foto y Avo te dice si te conviene.").font(.subheadline).foregroundStyle(Theme.muted)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right").foregroundStyle(Theme.muted)
            }
            .card(padding: 14)
        }
        .buttonStyle(.plain)
    }
}

/// Un día desde la semana.
struct DayScreen: View {
    @Environment(Session.self) private var session
    @State var day: Date

    var body: some View {
        ScrollView {
            if let userId = session.user?.id {
                DayMealsView(userId: userId, day: $day) { EmptyView() }
                    .padding(.horizontal, Theme.gutter)
                    .padding(.bottom, 32)
            }
        }
        .screenBackground()
        .navigationTitle(Fmt.day(day))
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// Comidas de un día: resumen de calorías y macros, y la lista con indicaciones de la nutrióloga.
struct DayMealsView<Extra: View>: View {
    let userId: String
    @Binding var day: Date
    /// Cambia para volver a pedir las comidas (p. ej. al jalar para actualizar).
    var reloadKey = 0
    /// Algo más debajo del resumen, solo en el día de hoy (p. ej. "¿Tienes un antojo?").
    @ViewBuilder var todayExtra: () -> Extra

    @Environment(Session.self) private var session
    @Environment(Outbox.self) private var outbox
    @Environment(Connectivity.self) private var connectivity
    @State private var meals: [Meal]?
    @State private var moods: [MoodEntry] = []
    @State private var error: String?
    @State private var loadedDay: Date?
    @State private var moodsSignal = MoodsSignal.shared

    private var isToday: Bool { Fmt.isToday(day) }
    private var nextDay: Date { Fmt.addDays(day, 1) }

    /// Comidas que siguen en el teléfono (sin conexión o subiendo) para este día.
    private var queued: [MealJob] {
        outbox.jobs.filter { $0.userId == userId && $0.eatenAt >= day && $0.eatenAt < nextDay }
    }

    private enum Item: Identifiable {
        case meal(Meal)
        case job(MealJob)
        case mood(MoodEntry)

        var id: String {
            switch self {
            case .meal(let m): m.id
            case .job(let j): j.id
            case .mood(let m): m.id
            }
        }

        var date: Date {
            switch self {
            case .meal(let m): m.eatenDate
            case .job(let j): j.eatenAt
            case .mood(let m): m.feltDate
            }
        }
    }

    private var items: [Item] {
        let queuedIds = Set(queued.map(\.id))
        let server = (loadedDay == day ? meals ?? [] : []).filter { !queuedIds.contains($0.id) }.map(Item.meal)
        let feelings = (loadedDay == day ? moods : []).map(Item.mood)
        return (server + queued.map(Item.job) + feelings).sorted { $0.date < $1.date }
    }

    var body: some View {
        let list = loadedDay == day ? meals ?? [] : []
        let analyzed = list.filter { $0.status == .analyzed }
        let totals = list.reduce(Totals.zero) { acc, m in
            Totals(calories: acc.calories + (m.calories ?? 0), proteinG: acc.proteinG + (m.proteinG ?? 0), carbsG: acc.carbsG + (m.carbsG ?? 0), fatG: acc.fatG + (m.fatG ?? 0))
        }

        VStack(alignment: .leading, spacing: 16) {
            DayNav(
                label: Fmt.day(day),
                onPrev: { day = Fmt.addDays(day, -1) },
                onNext: { day = Fmt.addDays(day, 1) },
                nextDisabled: isToday
            )

            CalorieSummary(total: totals.calories, goal: session.user?.dailyKcalGoal, segments: analyzed.map { ($0.calories ?? 0, $0.kind) })
            MacroChips(protein: totals.proteinG, carbs: totals.carbsG, fat: totals.fatG)

            if isToday { todayExtra() }

            SectionTitle("Comidas y ánimo")
            if let error, meals == nil, queued.isEmpty {
                Notice(text: error, tone: .warning)
            } else if loadedDay != day && queued.isEmpty {
                ProgressView().frame(maxWidth: .infinity).padding(.vertical, 24)
            } else if items.isEmpty {
                VStack(spacing: 8) {
                    Image(systemName: "camera").font(.largeTitle).foregroundStyle(Theme.muted)
                    Text("Sin comidas este día").font(.headline)
                    Text("Las fotos que registres aparecerán aquí con su análisis.")
                        .font(.subheadline).foregroundStyle(Theme.muted).multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity)
                .card(padding: 24)
            } else {
                VStack(spacing: 10) {
                    ForEach(items) { item in
                        switch item {
                        case .meal(let meal):
                            VStack(alignment: .leading, spacing: 6) {
                                NavigationLink(value: MealRoute(id: meal.id)) { MealRow(meal: meal) }.buttonStyle(.plain)
                                if let c = meal.lastComment {
                                    CommentBubble(author: c.authorName ?? "Sin nombre", role: c.authorRole, time: Fmt.ago(c.createdAt), text: c.body)
                                        .padding(.leading, 16)
                                }
                            }
                        case .job(let job):
                            NavigationLink(value: MealRoute(id: job.id)) { QueuedMealRow(job: job) }.buttonStyle(.plain)
                        case .mood(let mood):
                            MoodRow(mood: mood, own: mood.userId == session.user?.id)
                        }
                    }
                }
            }
        }
        // Rápido mientras algo se analiza; después, cada 20 s para ver comentarios nuevos.
        .task(id: "\(day.timeIntervalSince1970)-\(outbox.syncedCount)-\(reloadKey)-\(moodsSignal.version)") {
            while !Task.isCancelled {
                await load()
                let analyzing = (meals ?? []).contains { $0.status == .pending }
                try? await Task.sleep(for: .seconds(analyzing ? 4 : 20))
            }
        }
    }

    private func load() async {
        let requested = day
        do {
            let range = ["user_id": userId, "from": Fmt.iso(requested), "to": Fmt.iso(Fmt.addDays(requested, 1))]
            async let freshMeals: [Meal] = APIClient.shared.request("GET", "/meals", query: range)
            async let freshMoods: [MoodEntry] = APIClient.shared.request("GET", "/moods", query: range)
            let fresh = try await freshMeals
            let feelings = (try? await freshMoods) ?? []
            guard requested == day else { return }
            moods = feelings
            if Fmt.isToday(requested), userId == session.user?.id {
                let queuedToday = outbox.jobs.filter { $0.userId == userId && Fmt.isToday($0.eatenAt) }.count
                WidgetSync.today(
                    consumed: fresh.reduce(0) { $0 + ($1.calories ?? 0) },
                    protein: fresh.reduce(0) { $0 + ($1.proteinG ?? 0) },
                    carbs: fresh.reduce(0) { $0 + ($1.carbsG ?? 0) },
                    fat: fresh.reduce(0) { $0 + ($1.fatG ?? 0) },
                    meals: fresh.count + queuedToday
                )
            }
            // Avo celebra cuando una comida termina de analizarse mientras la ves.
            if let before = meals, loadedDay == requested {
                for meal in fresh where meal.status != .pending && before.first(where: { $0.id == meal.id })?.status == .pending {
                    if meal.status == .analyzed { cheer(.celebrate, "¡Listo! \(Fmt.kcal(meal.calories))") } else { cheer(.oops, "No pude analizar una foto") }
                }
            }
            meals = fresh
            loadedDay = requested
            error = nil
        } catch is CancellationError {
        } catch {
            if requested == day { self.error = error.localizedDescription }
        }
    }
}

/// Total del día con su barra por comida (y la meta, si la hay).
struct CalorieSummary: View {
    let total: Double
    let goal: Int?
    let segments: [(Double, MealKind)]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(Fmt.number(total))
                    .font(.display(44, weight: 800, relativeTo: .largeTitle))
                    .foregroundStyle(Theme.ink)
                    .contentTransition(.numericText())
                Text(goal.map { "de \(Fmt.number(Double($0))) kcal" } ?? "kcal")
                    .font(.headline)
                    .foregroundStyle(Theme.muted)
            }
            GeometryReader { geo in
                let scale = max(Double(goal ?? 0), total, 1)
                HStack(spacing: 2) {
                    ForEach(Array(segments.enumerated()), id: \.offset) { _, segment in
                        Rectangle().fill(segment.1.color).frame(width: max(0, geo.size.width * segment.0 / scale - 2))
                    }
                    Spacer(minLength: 0)
                }
                .frame(height: 14)
                .background(Theme.sunken)
                .clipShape(.capsule)
            }
            .frame(height: 14)
            if let goal {
                let left = Double(goal) - total.rounded()
                Text(left >= 0 ? "Te quedan \(Fmt.kcal(left)) para tu meta" : "Pasaste tu meta por \(Fmt.kcal(-left))")
                    .font(.footnote)
                    .foregroundStyle(Theme.muted)
            }
        }
        .card()
        .accessibilityElement(children: .combine)
    }
}

/// Una comida en la lista: foto, hora y tipo, título y calorías.
struct MealRow: View {
    let meal: Meal

    var body: some View {
        HStack(spacing: 12) {
            RemoteImage(url: meal.photoUrl)
                .frame(width: 76, height: 76)
                .clipShape(.rect(cornerRadius: 16))
            VStack(alignment: .leading, spacing: 3) {
                Text(meal.meta).font(.caption.weight(.semibold)).foregroundStyle(Theme.muted)
                Text(meal.title).font(.headline).foregroundStyle(Theme.ink).lineLimit(2).multilineTextAlignment(.leading)
                if let detail = meal.detail {
                    Text(detail).font(.subheadline).foregroundStyle(Theme.ink.opacity(0.8))
                }
                switch meal.status {
                case .pending: Chip(text: "Analizando…", icon: "clock")
                case .error: Chip(text: "Sin análisis", icon: "exclamationmark.triangle", tone: .danger)
                case .analyzed: EmptyView()
                }
            }
            Spacer(minLength: 0)
            Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(Theme.muted.opacity(0.6))
        }
        .padding(10)
        .background(meal.kind.tint, in: .rect(cornerRadius: 22))
        .contentShape(.rect)
    }
}

/// Una comida que sigue en el teléfono.
struct QueuedMealRow: View {
    let job: MealJob
    @Environment(Outbox.self) private var outbox
    @Environment(Connectivity.self) private var connectivity

    var body: some View {
        HStack(spacing: 12) {
            Group {
                if let photo = outbox.photo(job.id) {
                    Image(uiImage: photo).resizable().scaledToFill()
                } else {
                    Theme.sunken
                }
            }
            .frame(width: 76, height: 76)
            .clipShape(.rect(cornerRadius: 16))
            VStack(alignment: .leading, spacing: 3) {
                Text("\(Fmt.time(job.eatenAt)) · \(MealKind.from(aiType: nil, eatenAt: job.eatenAt).label)")
                    .font(.caption.weight(.semibold)).foregroundStyle(Theme.muted)
                Text("Comida guardada en el teléfono").font(.headline).foregroundStyle(Theme.ink)
                if job.error != nil {
                    Chip(text: "No se pudo enviar", icon: "exclamationmark.triangle", tone: .danger)
                } else if outbox.sending == job.id {
                    Chip(text: "Enviando…", icon: "arrow.up.circle")
                } else {
                    Chip(text: connectivity.online ? "En cola" : "Se analiza al volver la señal", icon: "clock")
                }
            }
            Spacer(minLength: 0)
        }
        .padding(10)
        .background(Theme.surface, in: .rect(cornerRadius: 22))
        .contentShape(.rect)
    }
}
