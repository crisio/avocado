import SwiftUI

/// Tarjeta compacta de Hoy: retos de la semana y cuántas medallas lleva. Se esconde si no hay datos.
struct LogrosCard: View {
    @State private var achievements = Achievements.shared

    var body: some View {
        if let data = achievements.data {
            NavigationLink {
                LogrosView()
            } label: {
                VStack(alignment: .leading, spacing: 10) {
                    Text("Tus logros").font(.headline).foregroundStyle(Theme.ink)
                    ForEach(data.challenges) { c in
                        VStack(alignment: .leading, spacing: 4) {
                            Text("\(c.emoji) \(c.title) · \(c.done ? "✅" : "\(min(c.progress, c.target))/\(c.target)")")
                                .font(.subheadline)
                                .foregroundStyle(Theme.ink)
                            ProgressView(value: Double(min(c.progress, c.target)), total: Double(max(c.target, 1))).tint(Theme.accent)
                        }
                    }
                    HStack {
                        Text("🏅 \(data.summary.unlocked) de \(data.summary.total) medallas")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(Theme.accentStrong)
                        Spacer(minLength: 0)
                        Image(systemName: "chevron.right").foregroundStyle(Theme.muted)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .card(padding: 14)
            }
            .buttonStyle(.plain)
        }
    }
}

/// Logros: racha, retos de la semana, medallas y los accesorios de Avo.
struct LogrosView: View {
    @Environment(Session.self) private var session
    @State private var achievements = Achievements.shared
    @State private var error: String?

    private let columns = [GridItem(.adaptive(minimum: 104), spacing: 10, alignment: .top)]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                if let data = achievements.data {
                    header(data)
                    if let error { Notice(text: error, tone: .danger) }
                    if !data.challenges.isEmpty { challenges(data.challenges) }
                    medals(data.medals)
                    avo(data.accessories, equipped: data.equipped)
                } else {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 60)
                }
            }
            .padding(.horizontal, Theme.gutter)
            .padding(.bottom, 32)
        }
        .screenBackground()
        .navigationTitle("Tus logros")
        .navigationBarTitleDisplayMode(.inline)
        .task { if let id = session.user?.id { await achievements.refresh(userId: id) } }
    }

    private func header(_ data: AchievementsData) -> some View {
        VStack(spacing: 8) {
            MascotView(mood: .celebrate, size: 120, hd: true, loop: true, dressed: true)
            Text("🔥 Racha: \(Fmt.days(data.streak.current)) · récord \(data.streak.best)")
                .font(.headline)
                .foregroundStyle(Theme.ink)
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .background(Theme.warningSoft, in: .capsule)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 12)
    }

    private func challenges(_ list: [AchievementsData.Challenge]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Retos de la semana").font(.title3.weight(.bold)).foregroundStyle(Theme.ink)
            ForEach(list) { c in
                HStack(alignment: .top, spacing: 12) {
                    Text(c.emoji).font(.system(size: 34))
                    VStack(alignment: .leading, spacing: 4) {
                        Text(c.title).font(.headline).foregroundStyle(Theme.ink)
                        Text(c.description).font(.footnote).foregroundStyle(Theme.muted)
                        ProgressView(value: Double(min(c.progress, c.target)), total: Double(max(c.target, 1))).tint(Theme.accent)
                        Text(c.done ? "✅ ¡Cumplido!" : "\(min(c.progress, c.target))/\(c.target) · Termina el domingo")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(c.done ? Theme.accentStrong : Theme.muted)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .card(padding: 14)
                .accessibilityElement(children: .combine)
            }
        }
    }

    private func medals(_ list: [AchievementsData.Medal]) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Medallas").font(.title3.weight(.bold)).foregroundStyle(Theme.ink)
            ForEach(AchievementsData.groups, id: \.key) { group in
                let items = list.filter { $0.group == group.key }
                if !items.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(group.title).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.muted)
                        LazyVGrid(columns: columns, spacing: 10) {
                            ForEach(items) { MedalTile(medal: $0) }
                        }
                    }
                }
            }
        }
    }

    private func avo(_ list: [AchievementsData.Accessory], equipped: String?) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Tu Avo").font(.title3.weight(.bold)).foregroundStyle(Theme.ink)
            MascotView(mood: .love, size: 110, hd: false, dressed: true)
                .frame(maxWidth: .infinity)
            LazyVGrid(columns: columns, spacing: 10) {
                ForEach(list) { a in
                    let on = a.key == equipped
                    Button {
                        guard a.unlocked else { return }
                        Task { error = await achievements.equip(on ? nil : a.key) }
                    } label: {
                        VStack(spacing: 4) {
                            ZStack(alignment: .topTrailing) {
                                Text(a.emoji).font(.system(size: 36)).opacity(a.unlocked ? 1 : 0.3).grayscale(a.unlocked ? 0 : 1)
                                if on { Image(systemName: "checkmark.circle.fill").foregroundStyle(Theme.accent).offset(x: 10, y: -6) }
                                if !a.unlocked { Image(systemName: "lock.fill").font(.caption).foregroundStyle(Theme.muted).offset(x: 8, y: 20) }
                            }
                            Text(a.name).font(.caption.weight(.semibold)).foregroundStyle(Theme.ink).multilineTextAlignment(.center)
                            if !a.unlocked {
                                Text("Se gana con: \(a.requirement)").font(.caption2).foregroundStyle(Theme.muted).multilineTextAlignment(.center)
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .padding(10)
                        .background(on ? Theme.accentSoft : Theme.surface, in: .rect(cornerRadius: 16))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(a.unlocked ? "\(a.name)\(on ? ", puesto" : "")" : "\(a.name), bloqueado. Se gana con: \(a.requirement)")
                    .accessibilityHint(a.unlocked ? (on ? "Toca para quitarlo" : "Toca para ponérselo a Avo") : "")
                }
            }
        }
    }
}

private struct MedalTile: View {
    let medal: AchievementsData.Medal

    var body: some View {
        VStack(spacing: 4) {
            Text(medal.emoji).font(.system(size: 34)).grayscale(medal.unlocked ? 0 : 1).opacity(medal.unlocked ? 1 : 0.35)
            Text(medal.title).font(.caption.weight(.semibold)).foregroundStyle(Theme.ink).multilineTextAlignment(.center)
            if let at = medal.unlockedAt {
                Text(Fmt.day(Fmt.date(at))).font(.caption2).foregroundStyle(Theme.muted)
            } else {
                Text("\(min(medal.progress, medal.target))/\(medal.target)").font(.caption2).foregroundStyle(Theme.muted)
                ProgressView(value: Double(min(medal.progress, medal.target)), total: Double(max(medal.target, 1)))
                    .tint(Theme.muted)
                    .scaleEffect(y: 0.6)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(10)
        .background(Theme.surface, in: .rect(cornerRadius: 16))
        .opacity(medal.unlocked ? 1 : 0.8)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(medal.unlocked ? "\(medal.title), conseguida. \(medal.description)" : "\(medal.title), \(medal.progress) de \(medal.target). \(medal.description)")
    }
}

/// Hoja que se muestra una vez al ganar una medalla.
struct MedalCelebrationView: View {
    let medal: AchievementsData.Medal

    @Environment(\.dismiss) private var dismiss
    @State private var achievements = Achievements.shared
    @State private var busy = false

    var body: some View {
        let reward = achievements.unlockedAccessory
        ZStack {
            Confetti().ignoresSafeArea().allowsHitTesting(false)
            VStack(spacing: 12) {
                Text(medal.emoji).font(.system(size: 88))
                Text("¡Nueva medalla!").font(.display(30, weight: 800)).foregroundStyle(Theme.ink)
                Text(medal.title).font(.title3.weight(.bold)).foregroundStyle(Theme.accentStrong)
                Text(medal.description).font(.body).foregroundStyle(Theme.muted).multilineTextAlignment(.center)
                if let reward {
                    Text("Desbloqueaste: \(reward.emoji) \(reward.name) — ¡pónselos a Avo!")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Theme.ink)
                        .multilineTextAlignment(.center)
                        .padding(.top, 4)
                    Button {
                        busy = true
                        Task {
                            await achievements.equip(reward.key)
                            dismiss()
                        }
                    } label: { Text("Ponérselos").frame(maxWidth: .infinity) }
                        .primaryButton()
                        .disabled(busy)
                    Button("Luego") { dismiss() }.foregroundStyle(Theme.muted)
                } else {
                    Button { dismiss() } label: { Text("¡Genial!").frame(maxWidth: .infinity) }
                        .primaryButton()
                        .padding(.top, 8)
                }
            }
            .padding(24)
        }
        .sensoryFeedback(.success, trigger: medal.key)
        .background(Theme.ground)
    }
}
