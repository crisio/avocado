import SwiftUI

/// Saldo de los últimos 7 días (sin hoy) contra la meta y, si alcanza, la comida libre de hoy; Avo la recomienda en el chat.
struct WeekBudgetCard: View {
    var reloadKey = 0

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
                    SectionTitle("Tu saldo de los últimos 7 días")
                    Text("Pon tu meta diaria y tu objetivo en Perfil y Avo te dirá cuándo te alcanza para una comida libre.")
                        .font(.subheadline)
                        .foregroundStyle(Theme.muted)
                }
                .card()
            case .some(.some(let b)):
                content(b).card()
            }
        }
        .task(id: "\(reloadKey)-\(session.user?.goal?.rawValue ?? "")-\(session.user?.dailyKcalGoal ?? 0)") { await load() }
    }

    @ViewBuilder private func content(_ b: Budget) -> some View {
        let counted = b.days.filter(\.counted).count
        let under = b.balance >= 0
        let bulking = b.goal == .subir

        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .center) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Tu saldo de los últimos 7 días").font(.subheadline.weight(.semibold)).foregroundStyle(Theme.muted)
                    if counted > 0 {
                        Text("\(Text(Fmt.number(abs(b.balance))).font(.display(40, weight: 800, relativeTo: .largeTitle))) \(Text("kcal").font(.headline))")
                            .foregroundStyle(under ? Theme.accentStrong : Theme.warningInk)
                        Text("\(under ? "por debajo" : "por encima") de tu meta en \(counted) \(counted == 1 ? "día completo" : "días completos")")
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
                Text("Elige tu objetivo en Perfil (bajar, mantener o subir) para saber si te toca comida libre.").font(.subheadline)
            } else if b.extra > 0 {
                Text(bulking
                    ? "Para tu volumen, hoy te conviene comer hasta **\(Fmt.kcal(b.extra)) extra**."
                    : "🎉 Hoy te alcanza para una **comida libre de hasta \(Fmt.kcal(b.extra)) extra** sin salirte de tu meta de la semana.")
                    .font(.subheadline)
                    .foregroundStyle(Theme.accentStrong)
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Theme.accentSoft, in: .rect(cornerRadius: 14))
            } else {
                Text(bulking
                    ? "Esta semana vas bien con tu meta de volumen."
                    : under
                        ? "Todavía no alcanza para una comida libre: unos días más por debajo de tu meta y listo."
                        : "Esta semana vas por encima de tu meta: mejor espera para la comida libre.")
                    .font(.subheadline)
                    .foregroundStyle(Theme.muted)
            }

            if b.goal != nil {
                let button = Button {
                    AvoPrompt.shared.ask(bulking ? AvoPrompt.bulk : AvoPrompt.cheatMeal)
                } label: {
                    Label(bulking ? "Ideas para mi volumen" : "Recomiéndame un cheat meal", systemImage: "bubble.left.and.bubble.right.fill")
                        .frame(maxWidth: .infinity)
                }
                if b.extra > 0 { button.primaryButton() } else { button.secondaryButton() }
            }

            FinePrint("Cuentan los últimos 7 días (sin hoy) con al menos 60 % de tu meta registrada"
                + (b.skipped > 0 ? " (\(b.skipped) no \(b.skipped == 1 ? "cuenta" : "cuentan") por \(b.skipped == 1 ? "incompleto" : "incompletos"))" : "")
                + ". La comida libre se topa a media meta diaria. El plan de tu nutrióloga manda.")
        }
    }

    /// Sin conexión se queda lo último que se vio (o nada).
    private func load() async {
        do {
            let fresh: Budget? = try await APIClient.shared.request("GET", "/budget", query: ["offset": String(Fmt.timezoneOffset)])
            budget = .some(fresh)
        } catch {}
    }
}
