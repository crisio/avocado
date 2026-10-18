import SwiftUI
import UIKit

/// Micrófono para dictar: un toque empieza, otro termina y el texto se agrega al campo.
struct VoiceButton: View {
    @Binding var text: String
    /// "cocina" o "nota": ayuda al servidor a entender mejor lo que se dijo.
    var context: String
    @Environment(Connectivity.self) private var connectivity
    @State private var recorder = AudioRecorder()
    @State private var transcribing = false
    @State private var denied = false
    @State private var error: String?

    private struct Transcription: Decodable { let text: String }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Button(action: toggle) {
                if recorder.isRecording {
                    HStack(spacing: 8) {
                        PulsingDot()
                        if let start = recorder.startedAt {
                            Text(start, style: .timer).monospacedDigit()
                        }
                        Text("Toca para terminar")
                    }
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Theme.danger)
                } else if transcribing {
                    HStack(spacing: 8) {
                        ProgressView()
                        Text("Escribiendo lo que dijiste…").font(.footnote)
                    }
                    .foregroundStyle(Theme.muted)
                } else {
                    Label("Dictar", systemImage: "mic.fill")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(Theme.accentStrong)
                }
            }
            .buttonStyle(.plain)
            .padding(.vertical, 8)
            .padding(.horizontal, 12)
            .background(recorder.isRecording ? Theme.dangerSoft : Theme.sunken, in: .capsule)
            .disabled(transcribing)
            .accessibilityLabel(recorder.isRecording ? "Terminar de dictar" : "Dictar con la voz")

            if denied {
                HStack(spacing: 8) {
                    Text("Activa el micrófono para dictar").font(.footnote).foregroundStyle(Theme.danger)
                    Button("Abrir Ajustes") {
                        if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
                    }
                    .font(.footnote.weight(.semibold))
                }
            }
            if let error { Text(error).font(.footnote).foregroundStyle(Theme.danger) }
        }
        .onDisappear { if recorder.isRecording { recorder.cancel() } }
    }

    private func toggle() {
        error = nil
        denied = false
        if recorder.isRecording {
            Task { await finish() }
        } else {
            guard connectivity.online else { error = "Necesitas internet para dictar"; return }
            Task {
                do {
                    try await recorder.start()
                } catch AudioRecorder.RecorderError.denied {
                    denied = true
                } catch {
                    self.error = error.localizedDescription
                }
            }
        }
    }

    private func finish() async {
        let wav: Data
        do { wav = try recorder.stop() } catch {
            self.error = error.localizedDescription
            return
        }
        transcribing = true
        defer { transcribing = false }
        var form = MultipartForm()
        form.addFile("audio", filename: "audio.wav", mimeType: "audio/wav", data: wav)
        form.add("context", context)
        do {
            let result: Transcription = try await APIClient.shared.request("POST", "/transcribe", form: form, timeout: 60)
            let heard = result.text.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !heard.isEmpty else { error = "No te entendí el audio. ¿Me lo repites?"; return }
            text = text.isEmpty ? heard : text + (text.hasSuffix(" ") ? "" : " ") + heard
        } catch let failure as APIError {
            error = failure.status == 0 ? "Necesitas internet para dictar" : failure.message
        } catch {
            self.error = error.localizedDescription
        }
    }
}

private struct PulsingDot: View {
    @State private var on = false
    var body: some View {
        Circle().fill(Theme.danger).frame(width: 10, height: 10)
            .opacity(on ? 0.3 : 1)
            .animation(.easeInOut(duration: 0.7).repeatForever(autoreverses: true), value: on)
            .onAppear { on = true }
    }
}
