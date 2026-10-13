import SwiftUI
import WidgetKit

/// Widget "Mi día" de Avocado: calorías contra la meta, macros y racha. Al tocarlo se abre la cámara para registrar.
@main
struct AvocadoWidgets: WidgetBundle {
    var body: some Widget {
        TodayWidget()
    }
}

struct TodayWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: WidgetSnapshot.widgetKind, provider: Provider()) { entry in
            TodayWidgetView(entry: entry)
        }
        .configurationDisplayName("Avocado · Mi día")
        .description("Tus calorías, macros y racha. Tócalo para registrar una comida.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}

// MARK: - Datos

struct Entry: TimelineEntry {
    let date: Date
    /// nil = la app todavía no ha guardado nada (o no se ha entrado).
    let snapshot: WidgetSnapshot?
}

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> Entry {
        Entry(date: .now, snapshot: .sample)
    }

    func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) {
        completion(Entry(date: .now, snapshot: context.isPreview ? .sample : WidgetSnapshot.load()?.forToday()))
    }

    /// Ahora y a medianoche (el día empieza en cero). La app pide recargar cada vez que cambian los números.
    func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
        let now = Date.now
        let midnight = Calendar.current.startOfDay(for: now.addingTimeInterval(86_400))
        let saved = WidgetSnapshot.load()
        let entries = [
            Entry(date: now, snapshot: saved?.forToday(now)),
            Entry(date: midnight, snapshot: saved?.forToday(midnight)),
        ]
        completion(Timeline(entries: entries, policy: .after(midnight.addingTimeInterval(60))))
    }
}

// MARK: - Vistas

private enum Palette {
    static let top = Color(red: 0.10, green: 0.17, blue: 0.11)
    static let bottom = Color(red: 0.07, green: 0.11, blue: 0.08)
    static let accent = Color(red: 0.55, green: 0.73, blue: 0.42) // #8DBB6A
    static let protein = Color(red: 0.55, green: 0.73, blue: 0.42)
    static let carbs = Color(red: 0.95, green: 0.76, blue: 0.31) // #F2C14E
    static let fat = Color(red: 0.93, green: 0.56, blue: 0.49) // #EE8E7E
    static let over = Color(red: 0.93, green: 0.56, blue: 0.24)
    static let track = Color.white.opacity(0.14)
    static let muted = Color.white.opacity(0.6)
}

private let addMealURL = URL(string: "avocado://nueva")!
private let avoURL = URL(string: "avocado://avo")!

private func number(_ n: Double) -> String {
    let formatter = NumberFormatter()
    formatter.locale = Locale(identifier: "es_MX")
    formatter.numberStyle = .decimal
    formatter.maximumFractionDigits = 0
    return formatter.string(from: NSNumber(value: n.rounded())) ?? "\(Int(n.rounded()))"
}

struct TodayWidgetView: View {
    let entry: Entry
    @Environment(\.widgetFamily) private var family

    var body: some View {
        content
            .containerBackground(for: .widget) {
                if family == .systemSmall || family == .systemMedium {
                    LinearGradient(colors: [Palette.top, Palette.bottom], startPoint: .top, endPoint: .bottom)
                } else {
                    Color.clear
                }
            }
            .widgetURL(addMealURL)
    }

    @ViewBuilder private var content: some View {
        switch family {
        case .systemMedium: MediumView(snapshot: entry.snapshot)
        case .accessoryCircular: CircularView(snapshot: entry.snapshot)
        case .accessoryRectangular: RectangularView(snapshot: entry.snapshot)
        case .accessoryInline: InlineView(snapshot: entry.snapshot)
        default: SmallView(snapshot: entry.snapshot)
        }
    }
}

/// Anillo de calorías contra la meta (sin meta, lleno a la mitad como referencia visual).
private struct CalorieRing: View {
    let snapshot: WidgetSnapshot
    var lineWidth: CGFloat = 9
    var big = false

    var body: some View {
        let goal = snapshot.goal ?? 0
        let progress = goal > 0 ? snapshot.consumed / goal : 0
        ZStack {
            Circle().stroke(Palette.track, lineWidth: lineWidth)
            Circle()
                .trim(from: 0, to: min(progress, 1))
                .stroke(progress > 1 ? Palette.over : Palette.accent, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                .rotationEffect(.degrees(-90))
            VStack(spacing: 0) {
                Text(number(snapshot.consumed))
                    .font(.system(size: big ? 26 : 22, weight: .heavy, design: .rounded))
                    .minimumScaleFactor(0.6)
                    .lineLimit(1)
                Text(goal > 0 ? "de \(number(goal))" : "kcal")
                    .font(.system(size: 11, weight: .semibold, design: .rounded))
                    .foregroundStyle(Palette.muted)
                    .lineLimit(1)
            }
            .padding(.horizontal, lineWidth + 2)
        }
        .foregroundStyle(.white)
    }
}

private struct StreakLabel: View {
    let snapshot: WidgetSnapshot

    var body: some View {
        HStack(spacing: 3) {
            Image(systemName: "flame.fill")
                .foregroundStyle(snapshot.loggedToday ? Palette.over : Palette.muted)
            Text("\(snapshot.streak)")
                .fontWeight(.heavy)
                .foregroundStyle(.white)
        }
        .font(.system(size: 14, design: .rounded))
        .accessibilityLabel("Racha de \(snapshot.streak) días")
    }
}

private struct EmptyStateView: View {
    var body: some View {
        VStack(spacing: 6) {
            Image("avo").resizable().scaledToFit().frame(width: 52, height: 52)
            Text("Abre Avocado para ver tu día")
                .font(.system(size: 12, weight: .semibold, design: .rounded))
                .multilineTextAlignment(.center)
                .foregroundStyle(.white)
        }
    }
}

private struct SmallView: View {
    let snapshot: WidgetSnapshot?

    var body: some View {
        if let snapshot {
            VStack(spacing: 6) {
                HStack {
                    StreakLabel(snapshot: snapshot)
                    Spacer()
                    Image("avo").resizable().scaledToFit().frame(width: 26, height: 26)
                }
                CalorieRing(snapshot: snapshot)
                Label("Foto", systemImage: "camera.fill")
                    .font(.system(size: 12, weight: .bold, design: .rounded))
                    .lineLimit(1)
                    .foregroundStyle(Palette.bottom)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
                    .background(Palette.accent, in: .capsule)
            }
        } else {
            EmptyStateView()
        }
    }
}

private struct MediumView: View {
    let snapshot: WidgetSnapshot?

    var body: some View {
        if let snapshot {
            HStack(spacing: 14) {
                VStack(alignment: .leading, spacing: 4) {
                    StreakLabel(snapshot: snapshot)
                    Spacer(minLength: 0)
                    Text("HOY")
                        .font(.system(size: 11, weight: .bold, design: .rounded))
                        .foregroundStyle(Palette.muted)
                    if let goal = snapshot.goal {
                        let left = goal - snapshot.consumed.rounded()
                        Text(left >= 0 ? "Te quedan \(number(left))" : "\(number(-left)) de más")
                            .font(.system(size: 14, weight: .heavy, design: .rounded))
                            .foregroundStyle(left >= 0 ? Palette.accent : Palette.over)
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                    }
                    Text("\(snapshot.meals) \(snapshot.meals == 1 ? "comida" : "comidas")")
                        .font(.system(size: 12, weight: .semibold, design: .rounded))
                        .foregroundStyle(Palette.muted)
                    Spacer(minLength: 0)
                    Link(destination: addMealURL) {
                        Label("Foto", systemImage: "camera.fill")
                            .font(.system(size: 13, weight: .bold, design: .rounded))
                            .lineLimit(1)
                            .foregroundStyle(Palette.bottom)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 5)
                            .background(Palette.accent, in: .capsule)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                CalorieRing(snapshot: snapshot, lineWidth: 11, big: true)
                    .frame(width: 110, height: 110)

                VStack(alignment: .leading, spacing: 8) {
                    macro("PROTEÍNA", snapshot.protein, Palette.protein)
                    macro("CARBS", snapshot.carbs, Palette.carbs)
                    macro("GRASA", snapshot.fat, Palette.fat)
                    Link(destination: avoURL) {
                        HStack(spacing: 4) {
                            Image("avo").resizable().scaledToFit().frame(width: 18, height: 18)
                            Text("Avo").font(.system(size: 12, weight: .bold, design: .rounded))
                        }
                        .foregroundStyle(.white)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .foregroundStyle(.white)
        } else {
            EmptyStateView()
        }
    }

    private func macro(_ label: String, _ grams: Double, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("\(Int(grams.rounded())) g")
                .font(.system(size: 17, weight: .heavy, design: .rounded))
                .foregroundStyle(color)
            Text(label)
                .font(.system(size: 9, weight: .bold, design: .rounded))
                .foregroundStyle(Palette.muted)
        }
    }
}

private struct CircularView: View {
    let snapshot: WidgetSnapshot?

    var body: some View {
        if let snapshot, let goal = snapshot.goal {
            Gauge(value: min(snapshot.consumed, goal), in: 0...goal) {
                Image(systemName: "fork.knife")
            } currentValueLabel: {
                Text(number(snapshot.consumed)).font(.system(.body, design: .rounded).weight(.bold)).minimumScaleFactor(0.5)
            }
            .gaugeStyle(.accessoryCircular)
        } else {
            ZStack {
                AccessoryWidgetBackground()
                Image(systemName: "camera.fill").font(.title3)
            }
        }
    }
}

private struct RectangularView: View {
    let snapshot: WidgetSnapshot?

    var body: some View {
        if let snapshot {
            VStack(alignment: .leading, spacing: 2) {
                Text("🔥 \(snapshot.streak) · Avocado").font(.system(.caption, design: .rounded).weight(.bold))
                Text(snapshot.goal.map { "\(number(snapshot.consumed)) / \(number($0)) kcal" } ?? "\(number(snapshot.consumed)) kcal")
                    .font(.system(.headline, design: .rounded))
                Text("P \(Int(snapshot.protein.rounded())) · C \(Int(snapshot.carbs.rounded())) · G \(Int(snapshot.fat.rounded()))")
                    .font(.system(.caption2, design: .rounded))
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        } else {
            Label("Registrar comida", systemImage: "camera.fill").font(.headline)
        }
    }
}

private struct InlineView: View {
    let snapshot: WidgetSnapshot?

    var body: some View {
        if let snapshot {
            Text("🔥\(snapshot.streak) · \(number(snapshot.consumed))\(snapshot.goal.map { "/\(number($0))" } ?? "") kcal")
        } else {
            Text("Avocado · Registrar comida")
        }
    }
}

#Preview(as: .systemMedium) {
    TodayWidget()
} timeline: {
    Entry(date: .now, snapshot: .sample)
}

#Preview(as: .systemSmall) {
    TodayWidget()
} timeline: {
    Entry(date: .now, snapshot: .sample)
}
