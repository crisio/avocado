import SwiftUI

/// "¿Lo cocinaste tú?": cómo, con qué grasa y cuánta; se junta en una frase para la IA.
struct CookingSection: View {
    let userId: String
    @Binding var cooking: String?

    @State private var enabled = false
    @State private var method: String?
    @State private var fat: String?
    @State private var amount: String?
    @State private var extra = ""

    private static let methods = ["A la plancha", "Frito", "Al horno", "Salteado", "Hervido o al vapor"]
    private static let fats = ["Aceite de oliva", "Aceite de aguacate", "Aceite vegetal", "Mantequilla", "Manteca", "Sin grasa"]
    private static let amounts = ["1 cdita", "1 cda", "2 cdas", "3 o más", "Para freír"]

    private var oilKey: String { "avocado.lastOil.\(userId)" }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Toggle("🍳 ¿Lo cocinaste tú?", isOn: $enabled)
                .font(.subheadline.weight(.semibold))
                .tint(Theme.accent)
            if enabled {
                group("¿Cómo?", Self.methods, $method)
                group("¿Con qué?", Self.fats, $fat)
                if fat != "Sin grasa" { group("¿Cuánto?", Self.amounts, $amount) }
                VStack(alignment: .leading, spacing: 8) {
                    TextField("¿Algo más? (crema, queso, azúcar…)", text: $extra, prompt: Text("Ej.: le eché crema y un poco de queso"), axis: .vertical)
                        .lineLimit(1...3)
                        .padding(12)
                        .background(Theme.sunken, in: .rect(cornerRadius: 14))
                    VoiceButton(text: $extra, context: "cocina")
                }
            }
        }
        .card()
        .onChange(of: enabled) {
            if enabled, fat == nil { fat = UserDefaults.standard.string(forKey: oilKey) }
            compose()
        }
        .onChange(of: method) { compose() }
        .onChange(of: fat) {
            if let fat, fat != "Sin grasa" { UserDefaults.standard.set(fat, forKey: oilKey) }
            compose()
        }
        .onChange(of: amount) { compose() }
        .onChange(of: extra) { compose() }
    }

    private func group(_ title: String, _ options: [String], _ selection: Binding<String?>) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.footnote.weight(.semibold)).foregroundStyle(Theme.muted)
            FlowLayout {
                ForEach(options, id: \.self) { option in
                    let on = selection.wrappedValue == option
                    Button {
                        selection.wrappedValue = on ? nil : option
                    } label: {
                        Text(option)
                            .font(.subheadline.weight(.medium))
                            .padding(.vertical, 8)
                            .padding(.horizontal, 12)
                            .foregroundStyle(on ? Color.white : Theme.ink)
                            .background(on ? Theme.accentStrong : Theme.sunken, in: .capsule)
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(on ? .isSelected : [])
                }
            }
        }
    }

    private func compose() {
        guard enabled else { cooking = nil; return }
        var parts: [String] = []
        let how = method
        let amountText: String? = switch amount {
        case "1 cdita": "1 cucharadita"
        case "1 cda": "1 cucharada"
        case "2 cdas": "2 cucharadas"
        case "3 o más": "3 o más cucharadas"
        default: nil
        }
        var sentence = how ?? ""
        if fat == "Sin grasa" {
            sentence += sentence.isEmpty ? "Sin grasa" : " sin grasa"
        } else if let fat {
            let name = fat.lowercased()
            if amount == "Para freír" {
                sentence += sentence.isEmpty ? "Frito en \(name) (para freír)" : " con \(name) (para freír)"
            } else if let amountText {
                sentence += (sentence.isEmpty ? "Con " : " con ") + "\(amountText) de \(name)"
            } else {
                sentence += (sentence.isEmpty ? "Con " : " con ") + name
            }
        } else if let amountText {
            sentence += (sentence.isEmpty ? "" : ", ") + amountText + " de grasa"
        } else if amount == "Para freír" {
            sentence += (sentence.isEmpty ? "" : ", ") + "frito en aceite (para freír)"
        }
        if !sentence.isEmpty { parts.append(sentence + ".") }
        let more = extra.trimmingCharacters(in: .whitespacesAndNewlines)
        if !more.isEmpty { parts.append(more.hasSuffix(".") ? more : more + ".") }
        let joined = parts.joined(separator: " ")
        cooking = joined.isEmpty ? nil : String(joined.prefix(500))
    }
}
