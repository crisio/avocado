import SwiftUI

/// Saldo de los últimos 7 días (sin hoy) contra la meta y, si alcanza, la comida libre de hoy; Avo la recomienda en el chat.
struct WeekBudgetCard: View {
    var reloadKey = 0
    /// Saldo de otra persona (su paciente, visto por la nutrióloga); sin él, el del usuario de la sesión. Con él, texto en tercera persona.
    var userId: String?

    private var own: Bool { userId == nil }

    @Environment(Session.self) private var session
    @State private var budget: Budget??

    var body: some View {
        Group {
            switch budget {
            case .none:
                // No EmptyView: una vista vacía no corre su .task y nunca pediría el saldo.
                Color.clear.frame(height: 0)
            case .some(.none):
                VStack(alignment: .leading, spacing: 8) {
                    SectionTitle(own ? "Tu saldo de los últimos 7 días" : "Su saldo de los últimos 7 días")
                    Text(own
                        ? "Pon tu meta diaria y tu objetivo en Perfil y Avo te dirá cuándo te alcanza para una comida libre."
                        : "Define su meta diaria y su objetivo en \"Editar metas\" para ver su saldo de la semana.")
                        .font(.subheadline)
                        .foregroundStyle(Theme.muted)
                }
                .card()
            case .some(.some(let b)):
                content(b).card()
            }
        }
        .task(id: "\(userId ?? "")-\(reloadKey)-\(session.user?.goal?.rawValue ?? "")-\(session.user?.dailyKcalGoal ?? 0)") { await load() }
    }

    @ViewBuilder private func content(_ b: Budget) -> some View {
        let counted = b.days.filter(\.counted).count
        let under = b.balance >= 0
        let bulking = b.goal == .subir

        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .center) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(own ? "Tu saldo de los últimos 7 días" : "Su saldo de los últimos 7 días").font(.subheadline.weight(.semibold)).foregroundStyle(Theme.muted)
                    if counted > 0 {
                        Text("\(Text(Fmt.number(abs(b.balance))).font(.display(40, weight: 800, relativeTo: .largeTitle))) \(Text("kcal").font(.headline))")
                            .foregroundStyle(under ? Theme.accentStrong : Theme.warningInk)
                        Text("\(under ? "por debajo" : "por encima") de \(own ? "tu" : "su") meta en \(counted) \(counted == 1 ? "día completo" : "días completos")")
                            .font(.subheadline)
                            .foregroundStyle(Theme.muted)
                    } else {
                        Text("—").font(.display(40, weight: 800))
                        Text("Aún no hay días completos en los últimos 7 días").font(.subheadline).foregroundStyle(Theme.muted)
                    }
                }
                Spacer(minLength: 8)
                MascotView(mood: b.extra > 0 ? (bulking ? .eat : .celebrate) : .think, size: 64, pose: 3)
            }

            if b.goal == nil {
                Text(!own ? "Aún no tiene objetivo: defínelo en \"Editar metas\"." : "Elige tu objetivo en Perfil (bajar, mantener o subir) para saber si te toca comida libre.").font(.subheadline)
            } else if b.extra > 0 {
                Text(!own
                    ? (bulking
                        ? "Para su volumen, hoy le conviene comer hasta **\(Fmt.kcal(b.extra)) extra**."
                        : "Hoy le alcanza para una **comida libre de hasta \(Fmt.kcal(b.extra)) extra** sin salirse de su meta de la semana.")
                    : bulking
                    ? "Para tu volumen, hoy te conviene comer hasta **\(Fmt.kcal(b.extra)) extra**."
                    : "🎉 Hoy te alcanza para una **comida libre de hasta \(Fmt.kcal(b.extra)) extra** sin salirte de tu meta de la semana.")
                    .font(.subheadline)
                    .foregroundStyle(Theme.accentStrong)
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Theme.accentSoft, in: .rect(cornerRadius: 14))
            } else {
                Text(!own
                    ? (bulking
                        ? "Esta semana va bien con su meta de volumen."
                        : under
                            ? "Todavía no le alcanza para una comida libre."
                            : "Esta semana va por encima de su meta.")
                    : bulking
                    ? "Esta semana vas bien con tu meta de volumen."
                    : under
                        ? "Todavía no alcanza para una comida libre: unos días más por debajo de tu meta y listo."
                        : "Esta semana vas por encima de tu meta: mejor espera para la comida libre.")
                    .font(.subheadline)
                    .foregroundStyle(Theme.muted)
            }

            if b.goal != nil, own {
                let button = Button {
                    AvoPrompt.shared.ask(bulking ? AvoPrompt.bulk : AvoPrompt.cheatMeal)
                } label: {
                    Label(bulking ? "Ideas para mi volumen" : "Recomiéndame un cheat meal", systemImage: "bubble.left.and.bubble.right.fill")
                        .frame(maxWidth: .infinity)
                }
                if b.extra > 0 { button.primaryButton() } else { button.secondaryButton() }
            }

            FinePrint("Cuentan los últimos 7 días (sin hoy) con al menos 60 % de \(own ? "tu" : "su") meta registrada"
                + (b.skipped > 0 ? " (\(b.skipped) no \(b.skipped == 1 ? "cuenta" : "cuentan") por \(b.skipped == 1 ? "incompleto" : "incompletos"))" : "")
                + ". La comida libre se topa a media meta diaria." + (own ? " El plan de tu nutrióloga manda." : ""))
        }
    }

    private var query: [String: String] {
        var q = ["offset": String(Fmt.timezoneOffset)]
        if let userId { q["user_id"] = userId }
        return q
    }

    /// Sin conexión se queda lo último que se vio (o nada).
    private func load() async {
        do {
            let fresh: Budget? = try await APIClient.shared.request("GET", "/budget", query: query)
            budget = .some(fresh)
        } catch {}
    }
}
