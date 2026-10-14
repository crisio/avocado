import SwiftUI

/// Lo que lleva el reporte semanal de un paciente.
struct ReportData {
    let name: String
    let start: Date
    let goals: CareGoals
    let stats: WeekStats
    let timing: TimingStats?
    let mood: MoodStats?
    let streak: Streak?
    let generated: Date
}

/// Archivo del reporte ya hecho (para la hoja de compartir).
struct ReportFile: Identifiable {
    let id = UUID()
    let url: URL
    /// Vista previa del mismo reporte (imagen).
    let preview: UIImage?
}

/// Junta los datos de la semana del paciente y arma el PDF.
@MainActor
enum ReportBuilder {
    static func build(patient: CarePatient, goals: CareGoals) async throws -> ReportFile {
        // Los últimos 7 días (con hoy) y no "de lunes a hoy": un lunes el reporte saldría casi vacío.
        let start = Fmt.addDays(Fmt.startOfDay(.now), -6)
        let range = ["user_id": patient.id, "from": Fmt.iso(start), "to": Fmt.iso(Fmt.addDays(start, 7))]
        let api = APIClient.shared
        let weekMeals: [Meal] = try await api.request("GET", "/meals", query: range)
        let weekMoods: [MoodEntry] = (try? await api.request("GET", "/moods", query: range)) ?? []
        let streak: Streak? = try? await api.request("GET", "/streak", query: ["user_id": patient.id, "offset": String(Fmt.timezoneOffset)])
        let data = ReportData(
            name: patient.displayName,
            start: start,
            goals: goals,
            stats: WeekStats(meals: weekMeals, start: start),
            timing: TimingStats(meals: weekMeals.filter { $0.status == .analyzed }),
            mood: MoodStats(moods: weekMoods),
            streak: streak,
            generated: .now
        )
        return try render(data)
    }

    /// PDF de una sola página, tan larga como haga falta (612 pt de ancho, como una carta).
    static func render(_ data: ReportData) throws -> ReportFile {
        let safeName = data.name.components(separatedBy: CharacterSet.alphanumerics.union(.init(charactersIn: " ")).inverted).joined()
            .trimmingCharacters(in: .whitespaces).replacingOccurrences(of: " ", with: "-")
        let day = DateFormatter()
        day.dateFormat = "yyyy-MM-dd"
        let url = FileManager.default.temporaryDirectory.appending(path: "Reporte-\(safeName)-\(day.string(from: data.generated)).pdf")

        let renderer = ImageRenderer(content: PatientReportView(data: data).frame(width: 612))
        renderer.proposedSize = ProposedViewSize(width: 612, height: nil)
        var wrote = false
        renderer.render { size, draw in
            var box = CGRect(origin: .zero, size: size)
            guard let pdf = CGContext(url as CFURL, mediaBox: &box, nil) else { return }
            pdf.beginPDFPage(nil)
            draw(pdf)
            pdf.endPDFPage()
            pdf.closePDF()
            wrote = true
        }
        guard wrote else { throw APIError(message: "No se pudo crear el PDF. Intenta de nuevo.", status: 0) }
        renderer.scale = 2
        return ReportFile(url: url, preview: renderer.uiImage)
    }
}

/// Hoja con la vista previa del reporte y el botón para compartirlo.
struct ReportSheet: View {
    let file: ReportFile
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                if let preview = file.preview {
                    Image(uiImage: preview)
                        .resizable()
                        .scaledToFit()
                        .clipShape(.rect(cornerRadius: 12))
                        .padding(Theme.gutter)
                        .accessibilityLabel("Vista previa del reporte")
                }
            }
            .screenBackground()
            .navigationTitle("Reporte de la semana")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cerrar") { dismiss() } }
                ToolbarItem(placement: .primaryAction) {
                    ShareLink(item: file.url) { Label("Compartir PDF", systemImage: "square.and.arrow.up") }
                }
            }
        }
    }
}

/// El reporte: nombre, semana, metas, tabla por día, macros, racha, ánimo y horarios. Se dibuja para el PDF y para la vista previa.
struct PatientReportView: View {
    let data: ReportData

    private let ink = Color(hex: 0x18221B)
    private let muted = Color(hex: 0x56645A)

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            header
            goalsBlock
            daysTable
            macrosBlock
            if let streak = data.streak { streakBlock(streak) }
            moodBlock
            timingBlock
            Spacer(minLength: 4)
            Text("Estimaciones hechas con IA a partir de las fotos del paciente: pueden equivocarse y no sustituyen el criterio profesional. Generado con Avocado el \(Fmt.longDate(data.generated)).")
                .font(.system(size: 9))
                .foregroundStyle(muted)
        }
        .padding(36)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white)
        .foregroundStyle(ink)
        .environment(\.colorScheme, .light)
    }

    private var header: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Reporte de la semana").font(.system(size: 12, weight: .semibold)).foregroundStyle(Theme.accent)
                Text(data.name).font(.display(30, weight: 800, relativeTo: .largeTitle))
                Text(Fmt.weekRange(data.start)).font(.system(size: 13)).foregroundStyle(muted)
            }
            Spacer()
            Text("Avocado").font(.display(20, weight: 800, relativeTo: .title2)).foregroundStyle(Theme.accent)
        }
    }

    private func block<Content: View>(_ title: String, @ViewBuilder _ content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.display(16, weight: 700, relativeTo: .headline))
            content()
        }
    }

    private var goalsBlock: some View {
        block("Metas") {
            let g = data.goals
            if g.dailyKcalGoal == nil && g.goal == nil && g.proteinGGoal == nil && g.carbsGGoal == nil && g.fatGGoal == nil {
                Text("Sin metas definidas.").font(.system(size: 12)).foregroundStyle(muted)
            } else {
                Text((g.dailyKcalGoal.map { Fmt.kcal(Double($0)) + " al día" } ?? "Sin meta de kcal") + (g.goal.map { " · Objetivo: \($0.label.lowercased())" } ?? ""))
                    .font(.system(size: 12))
                Text(PatientView.macroLine(g)).font(.system(size: 12))
            }
        }
    }

    private var daysTable: some View {
        block("Día por día") {
            let goal = data.goals.dailyKcalGoal
            VStack(spacing: 0) {
                row(["Día", "Comidas", "kcal", "Meta", "% de la meta"], bold: true)
                ForEach(data.stats.days.filter { !$0.future }) { day in
                    let pct = goal.map { day.meals == 0 ? "—" : "\(Int((day.calories / Double($0) * 100).rounded())) %" } ?? "—"
                    row([day.long, "\(day.meals)", day.meals == 0 ? "—" : Fmt.number(day.calories), goal.map { Fmt.number(Double($0)) } ?? "—", pct])
                }
            }
            .overlay(Rectangle().stroke(Color(hex: 0xE2E7DF), lineWidth: 1))
        }
    }

    private func row(_ cells: [String], bold: Bool = false) -> some View {
        HStack(spacing: 0) {
            ForEach(Array(cells.enumerated()), id: \.offset) { index, text in
                Text(text)
                    .font(.system(size: 11, weight: bold ? .bold : .regular))
                    .frame(maxWidth: .infinity, alignment: index == 0 ? .leading : .trailing)
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 5)
        .background(bold ? Color(hex: 0xEEF2EB) : Color.clear)
        .overlay(alignment: .bottom) { Rectangle().fill(Color(hex: 0xE2E7DF)).frame(height: 1) }
    }

    private var macrosBlock: some View {
        block("Promedio al día (días con registro)") {
            let avg = data.stats.average
            let g = data.goals
            VStack(spacing: 0) {
                row(["", "Promedio", "Meta"], bold: true)
                row(["Calorías", Fmt.kcal(avg.calories), g.dailyKcalGoal.map { Fmt.kcal(Double($0)) } ?? "—"])
                row(["Proteína", Fmt.grams(avg.proteinG), g.proteinGGoal.map { "\($0) g" } ?? "—"])
                row(["Carbohidratos", Fmt.grams(avg.carbsG), g.carbsGGoal.map { "\($0) g" } ?? "—"])
                row(["Grasa", Fmt.grams(avg.fatG), g.fatGGoal.map { "\($0) g" } ?? "—"])
            }
            .overlay(Rectangle().stroke(Color(hex: 0xE2E7DF), lineWidth: 1))
            Text("Registró \(Fmt.days(data.stats.logged)) de \(data.stats.elapsed) en estos 7 días.").font(.system(size: 11)).foregroundStyle(muted)
        }
    }

    private func streakBlock(_ streak: Streak) -> some View {
        block("Racha") {
            Text("\(Fmt.daysInARow(streak.current)) · su mejor racha: \(Fmt.days(streak.best)).").font(.system(size: 12))
        }
    }

    private var moodBlock: some View {
        block("Ánimo") {
            if let mood = data.mood, !mood.top.isEmpty {
                Text("Lo que más sintió: " + mood.top.map { "\($0.0.label.lowercased()) (\($0.1))" }.joined(separator: ", ") + ".").font(.system(size: 12))
                if let energy = mood.energy { Text("Energía promedio: \(String(format: "%.1f", energy)) de 5.").font(.system(size: 12)) }
                if let plan = mood.onPlan { Text("Iba con el plan \(plan.yes) de \(plan.total) \(plan.total == 1 ? "vez" : "veces").").font(.system(size: 12)) }
            } else {
                Text("No registró cómo se sentía en estos 7 días.").font(.system(size: 12)).foregroundStyle(muted)
            }
        }
    }

    private var timingBlock: some View {
        block("Horarios") {
            if let timing = data.timing {
                Text("Primera comida a las \(Fmt.time(timing.first)) y última a las \(Fmt.time(timing.last)), en promedio.").font(.system(size: 12))
                if let longest = timing.longest, longest.minutes >= 60 {
                    Text("Lo más que pasó sin comer en el día: \(TimingStats.duration(longest.minutes)).").font(.system(size: 12))
                }
                if timing.late > 0 {
                    Text("\(timing.late) \(timing.late == 1 ? "comida" : "comidas") después de las 9 de la noche.").font(.system(size: 12))
                }
            } else {
                Text("Sin comidas registradas en estos 7 días.").font(.system(size: 12)).foregroundStyle(muted)
            }
        }
    }
}
