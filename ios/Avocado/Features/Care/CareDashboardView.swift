import SwiftUI

/// Tablero de la nutrióloga: un resumen, el acceso para invitar y una tarjeta por paciente (los que tienen alertas, primero).
struct CareDashboardView: View {
    @Environment(Session.self) private var session
    @State private var patients: [CarePatient]?
    @State private var error: String?
    @State private var inviting = false

    private var name: String { Fmt.firstName(session.user?.fullName) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                PageHeader(eyebrow: Fmt.longDate(.now), title: "Pacientes") {
                    MascotView(mood: .idle, size: 80, reactive: true, bubbleEdge: .bottom)
                }

                if let patients {
                    if patients.isEmpty {
                        emptyState
                    } else {
                        summary(patients)
                        ForEach(patients) { patient in
                            NavigationLink(value: patient) { PatientCard(patient: patient) }.buttonStyle(.plain)
                        }
                    }
                } else if let error {
                    Notice(text: error, tone: .warning)
                } else {
                    ProgressView().frame(maxWidth: .infinity).padding(.vertical, 40)
                }

                if let error, patients != nil { Notice(text: error, tone: .warning) }
                FinePrint("Avocado es gratis para nutriólogas durante la beta.")
            }
            .padding(.horizontal, Theme.gutter)
            .padding(.bottom, 32)
        }
        .screenBackground()
        .refreshable { await load() }
        .toolbar(.hidden, for: .navigationBar)
        .navigationDestination(for: CarePatient.self) { PatientView(patient: $0) }
        .sheet(isPresented: $inviting) { InviteSheet() }
        // Se recarga cada minuto mientras se ve el tablero.
        .task {
            while !Task.isCancelled {
                await load()
                try? await Task.sleep(for: .seconds(60))
            }
        }
        .task {
            try? await Task.sleep(for: .milliseconds(500))
            cheer(.wave, name.isEmpty ? "¡Hola!" : "¡Hola, \(name)!")
        }
    }

    private func summary(_ list: [CarePatient]) -> some View {
        let alerted = list.filter { !$0.alerts.isEmpty }.count
        let text = "\(list.count) \(list.count == 1 ? "paciente" : "pacientes")"
            + (alerted > 0 ? " · \(alerted) con \(alerted == 1 ? "alerta" : "alertas")" : " · sin alertas")
        return HStack {
            Text(text).font(.headline).foregroundStyle(Theme.ink)
            Spacer(minLength: 8)
            Button("Invitar pacientes", systemImage: "person.badge.plus") { inviting = true }
                .font(.subheadline.weight(.semibold))
        }
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            MascotView(mood: .love, size: 96)
            Text("Aún no tienes pacientes").font(.display(24, weight: 800, relativeTo: .title2))
            Text("Comparte tu código o tu QR. Cuando tu paciente lo use, sus comidas aparecen aquí.")
                .font(.subheadline).foregroundStyle(Theme.muted).multilineTextAlignment(.center)
            Button {
                inviting = true
            } label: {
                Label("Invitar pacientes", systemImage: "person.badge.plus").frame(maxWidth: .infinity)
            }
            .primaryButton()
        }
        .frame(maxWidth: .infinity)
        .card(padding: 24)
        .padding(.top, 24)
    }

    private func load() async {
        do {
            let fresh: CareDashboard = try await APIClient.shared.request("GET", "/care/dashboard", query: ["offset": String(Fmt.timezoneOffset)])
            patients = fresh.patients
            error = nil
        } catch is CancellationError {
        } catch {
            // Sin conexión se queda lo último que se vio.
            self.error = error.localizedDescription
        }
    }
}

/// Tarjeta de un paciente en el tablero.
struct PatientCard: View {
    let patient: CarePatient

    var body: some View {
        let goal = patient.goals.dailyKcalGoal
        let consumed = patient.today.consumed

        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                Text(patient.displayName).font(.display(22, weight: 800, relativeTo: .title3)).foregroundStyle(Theme.ink)
                Spacer(minLength: 8)
                Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(Theme.muted.opacity(0.6))
            }

            if !patient.alerts.isEmpty {
                FlowLayout(spacing: 6) {
                    ForEach(patient.alerts, id: \.self) { alert in
                        Chip(text: alert.text, icon: alert.isDanger ? "exclamationmark.triangle.fill" : "exclamationmark.circle.fill", tone: alert.isDanger ? .danger : .warning)
                    }
                }
            }

            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text("Hoy").font(.subheadline.weight(.semibold)).foregroundStyle(Theme.muted)
                    Spacer(minLength: 8)
                    Text(goal.map { "\(Fmt.number(consumed)) de \(Fmt.number(Double($0))) kcal" } ?? Fmt.kcal(consumed))
                        .font(.subheadline.weight(.semibold)).foregroundStyle(Theme.ink)
                }
                if let goal {
                    ProgressView(value: min(consumed, Double(goal)), total: Double(goal))
                        .tint(consumed > Double(goal) ? Theme.orange : Theme.accent)
                } else {
                    FinePrint("Sin meta de kcal todavía.")
                }
            }

            HStack(spacing: 6) {
                Flame(lit: patient.streak.loggedToday, size: 18)
                Text(patient.streak.current == 0 ? "Sin racha" : Fmt.daysInARow(patient.streak.current))
                    .font(.subheadline.weight(.semibold)).foregroundStyle(Theme.ink)
            }

            VStack(alignment: .leading, spacing: 3) {
                Text(patient.lastMealAt.map { "Última comida \(Fmt.ago($0))" } ?? "Aún no registra comidas")
                Text("Registró \(patient.week.daysLogged) de 7 días" + (patient.week.onPlan.map { " · Con el plan \($0.yes) de \($0.total)" } ?? ""))
            }
            .font(.footnote)
            .foregroundStyle(Theme.muted)
        }
        .card()
        .contentShape(.rect)
        .accessibilityElement(children: .combine)
    }
}
