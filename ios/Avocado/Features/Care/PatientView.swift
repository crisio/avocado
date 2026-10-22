import SwiftUI

/// Un paciente visto por su nutrióloga: metas, su día, su semana y el reporte en PDF.
struct PatientView: View {
    let patient: CarePatient

    @State private var goals: CareGoals
    @State private var day = Fmt.startOfDay(.now)
    @State private var editing = false
    @State private var streak: Streak?
    @State private var fasting: FastingStatus?
    @State private var achievements: AchievementsData?
    @State private var reloads = 0
    @State private var report: ReportFile?
    @State private var makingReport = false
    @State private var reportError: String?

    init(patient: CarePatient) {
        self.patient = patient
        _goals = State(initialValue: patient.goals)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                PageHeader(eyebrow: "Paciente", title: patient.displayName)
                if patient.fullName?.isEmpty == false { FinePrint(patient.email) }

                if let streak { StreakChip(streak: streak, own: false) }

                goalsCard

                if let a = achievements {
                    Text("🏅 \(a.summary.unlocked) \(a.summary.unlocked == 1 ? "medalla" : "medallas") · 🔥 récord \(Fmt.days(a.streak.best))")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Theme.ink)
                        .card(padding: 14)
                }

                if let fasting, let plan = fasting.plan {
                    Label("Ayuno \(plan.label)" + (fasting.history.first.map { " · último ayuno \(FastingStatus.oneDecimal($0.hours)) h" } ?? ""), systemImage: "timer")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Theme.ink)
                        .card(padding: 14)
                }

                NavigationLink {
                    WeekView(userId: patient.id, goals: goals, patientName: Fmt.firstName(patient.fullName))
                } label: {
                    HStack {
                        Label("Su semana", systemImage: "calendar").font(.headline).foregroundStyle(Theme.ink)
                        Spacer()
                        Image(systemName: "chevron.right").foregroundStyle(Theme.muted)
                    }
                    .card(padding: 16)
                }
                .buttonStyle(.plain)

                VStack(alignment: .leading, spacing: 8) {
                    if let reportError { Notice(text: reportError, tone: .danger) }
                    Button {
                        Task { await makeReport() }
                    } label: {
                        Group {
                            if makingReport { ProgressView() } else { Label("Reporte de la semana", systemImage: "doc.richtext") }
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .secondaryButton()
                    .disabled(makingReport)
                }

                DayMealsView(userId: patient.id, day: $day, reloadKey: reloads, kcalGoal: goals.dailyKcalGoal, macroGoals: goals, own: false) {
                    EmptyView()
                }
            }
            .padding(.horizontal, Theme.gutter)
            .padding(.bottom, 32)
        }
        .screenBackground()
        .refreshable {
            reloads += 1
            await loadStreak()
            fasting = await FastingStatus.load(userId: patient.id)
        }
        .navigationBarTitleDisplayMode(.inline)
        .mealDestinations()
        .task { await loadStreak() }
        .task { fasting = await FastingStatus.load(userId: patient.id) }
        .task { achievements = await AchievementsData.load(userId: patient.id) }
        .sheet(isPresented: $editing) {
            GoalsEditorSheet(patientId: patient.id, name: patient.displayName, goals: goals) { goals = $0 }
        }
        .sheet(item: $report) { ReportSheet(file: $0) }
    }

    private var goalsCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionTitle("Metas")
            if goals.dailyKcalGoal == nil && goals.goal == nil && goals.proteinGGoal == nil && goals.carbsGGoal == nil && goals.fatGGoal == nil {
                Text("Aún no le pones metas. Cuando las definas, las verá en su app y ya no podrá cambiarlas.")
                    .font(.subheadline).foregroundStyle(Theme.muted)
            } else {
                VStack(alignment: .leading, spacing: 4) {
                    Text(goals.dailyKcalGoal.map { Fmt.kcal(Double($0)) + " al día" } ?? "Sin meta de kcal")
                        .font(.display(26, weight: 800, relativeTo: .title2))
                    if let goal = goals.goal { Text("Objetivo: \(goal.label.lowercased())").font(.subheadline).foregroundStyle(Theme.muted) }
                }
                Text(Self.macroLine(goals)).font(.subheadline).foregroundStyle(Theme.ink)
            }
            Button("Editar metas", systemImage: "slider.horizontal.3") { editing = true }.secondaryButton()
        }
        .card()
    }

    /// "Proteína 120 g · Carbs 180 g · Grasa 60 g" (solo las que tienen meta).
    static func macroLine(_ goals: CareGoals) -> String {
        let parts = [("Proteína", goals.proteinGGoal), ("Carbs", goals.carbsGGoal), ("Grasa", goals.fatGGoal)]
            .compactMap { label, grams in grams.map { "\(label) \($0) g" } }
        return parts.isEmpty ? "Sin metas de macros" : parts.joined(separator: " · ")
    }

    private func loadStreak() async {
        if let fresh: Streak = try? await APIClient.shared.request("GET", "/streak", query: ["user_id": patient.id, "offset": String(Fmt.timezoneOffset)]) {
            streak = fresh
        }
    }

    private func makeReport() async {
        makingReport = true
        reportError = nil
        do {
            report = try await ReportBuilder.build(patient: patient, goals: goals)
        } catch {
            reportError = error.localizedDescription
            cheer(.oops, "No pude hacer el reporte")
        }
        makingReport = false
    }
}

/// Hoja para editar las metas de un paciente (PATCH /care/patients/:id/goals).
struct GoalsEditorSheet: View {
    let patientId: String
    let name: String
    let onSaved: (CareGoals) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var kcal: String
    @State private var goal: Goal?
    @State private var protein: String
    @State private var carbs: String
    @State private var fat: String
    @State private var busy = false
    @State private var error: String?

    init(patientId: String, name: String, goals: CareGoals, onSaved: @escaping (CareGoals) -> Void) {
        self.patientId = patientId
        self.name = name
        self.onSaved = onSaved
        _kcal = State(initialValue: goals.dailyKcalGoal.map(String.init) ?? "")
        _goal = State(initialValue: goals.goal)
        _protein = State(initialValue: goals.proteinGGoal.map(String.init) ?? "")
        _carbs = State(initialValue: goals.carbsGGoal.map(String.init) ?? "")
        _fat = State(initialValue: goals.fatGGoal.map(String.init) ?? "")
    }

    private var kcalValue: Int? { Int(kcal.trimmingCharacters(in: .whitespaces)) }

    var body: some View {
        NavigationStack {
            Form {
                if let error { Section { Notice(text: error, tone: .danger) }.listRowBackground(Color.clear).listRowInsets(EdgeInsets()) }

                Section {
                    TextField("Ej. 1800", text: $kcal).keyboardType(.numberPad)
                } header: {
                    Text("Meta diaria (kcal)")
                } footer: {
                    Text("Entre 800 y 6,000. Déjala vacía para quitarla.")
                }

                Section {
                    Picker("Objetivo", selection: $goal) {
                        Text("Ninguno").tag(Goal?.none)
                        ForEach(Goal.allCases) { Text($0.label).tag(Goal?.some($0)) }
                    }
                    .pickerStyle(.segmented)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets())
                } header: {
                    Text("Objetivo")
                }

                Section {
                    macroField("Proteína (g)", $protein)
                    macroField("Carbohidratos (g)", $carbs)
                    macroField("Grasa (g)", $fat)
                    Button("Sugerir macros", systemImage: "wand.and.stars") { suggest() }.disabled(kcalValue == nil)
                } header: {
                    Text("Macros al día")
                } footer: {
                    Text("Sugerir macros reparte las kcal en 30 % proteína, 40 % carbohidratos y 30 % grasa. Puedes editarlos. Cada macro va de 0 a 800 g.")
                }

                Section {
                    Text("\(name) verá estas metas en su app y ya no podrá cambiarlas.").font(.footnote).foregroundStyle(Theme.muted)
                }
            }
            .navigationTitle("Metas de \(Fmt.firstName(name).isEmpty ? "tu paciente" : Fmt.firstName(name))")
            .navigationBarTitleDisplayMode(.inline)
            .scrollDismissesKeyboard(.interactively)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Guardar") { Task { await save() } }.disabled(busy)
                }
            }
        }
        .presentationDetents([.large])
    }

    private func macroField(_ label: String, _ value: Binding<String>) -> some View {
        HStack {
            Text(label)
            TextField("—", text: value).keyboardType(.numberPad).multilineTextAlignment(.trailing)
        }
    }

    /// 30 % proteína y 30 % grasa, 40 % carbohidratos (4/4/9 kcal por gramo).
    private func suggest() {
        guard let kcalValue else { return }
        let total = Double(kcalValue)
        protein = String(Int((total * 0.30 / 4).rounded()))
        carbs = String(Int((total * 0.40 / 4).rounded()))
        fat = String(Int((total * 0.30 / 9).rounded()))
    }

    /// Texto vacío = quitar la meta (NSNull); número inválido o fuera de rango = nil con error.
    private func value(_ text: String, _ range: ClosedRange<Int>, _ label: String) throws -> Any {
        let trimmed = text.trimmingCharacters(in: .whitespaces)
        if trimmed.isEmpty { return NSNull() }
        guard let n = Int(trimmed), range.contains(n) else {
            throw APIError(message: "\(label): escribe un número entre \(range.lowerBound) y \(range.upperBound).", status: 0)
        }
        return n
    }

    private func save() async {
        busy = true
        error = nil
        do {
            let body: [String: Any] = [
                "daily_kcal_goal": try value(kcal, 800...6000, "Meta diaria"),
                "goal": goal?.rawValue ?? NSNull(),
                "protein_g_goal": try value(protein, 0...800, "Proteína"),
                "carbs_g_goal": try value(carbs, 0...800, "Carbohidratos"),
                "fat_g_goal": try value(fat, 0...800, "Grasa"),
            ]
            let saved: CareGoals = try await APIClient.shared.request("PATCH", "/care/patients/\(patientId)/goals", json: body)
            onSaved(saved)
            cheer(.celebrate, "¡Metas guardadas!")
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
        busy = false
    }
}
