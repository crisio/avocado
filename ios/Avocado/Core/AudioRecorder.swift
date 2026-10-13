import AVFoundation
import Foundation

/// Graba audios para Avo en WAV mono de 16 kHz (el formato que acepta la IA; un minuto pesa ~1.9 MB).
@Observable
final class AudioRecorder {
    private(set) var isRecording = false
    private(set) var startedAt: Date?
    private var recorder: AVAudioRecorder?
    private let url = URL.temporaryDirectory.appending(path: "avo-audio.wav")

    enum RecorderError: LocalizedError {
        case denied, failed
        var errorDescription: String? {
            switch self {
            case .denied: "Necesito permiso para usar el micrófono. Puedes darlo en Ajustes → Avocado."
            case .failed: "No pude grabar el audio."
            }
        }
    }

    func start() async throws {
        guard await AVAudioApplication.requestRecordPermission() else { throw RecorderError.denied }
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playAndRecord, mode: .spokenAudio, options: [.defaultToSpeaker])
        try session.setActive(true)
        let settings: [String: Any] = [
            AVFormatIDKey: kAudioFormatLinearPCM,
            AVSampleRateKey: 16_000,
            AVNumberOfChannelsKey: 1,
            AVLinearPCMBitDepthKey: 16,
            AVLinearPCMIsFloatKey: false,
            AVLinearPCMIsBigEndianKey: false,
        ]
        let recorder = try AVAudioRecorder(url: url, settings: settings)
        guard recorder.record() else { throw RecorderError.failed }
        self.recorder = recorder
        isRecording = true
        startedAt = .now
    }

    /// Termina y regresa el WAV.
    func stop() throws -> Data {
        recorder?.stop()
        finish()
        guard let data = try? Data(contentsOf: url), data.count > 44 else { throw RecorderError.failed }
        return data
    }

    func cancel() {
        recorder?.stop()
        recorder?.deleteRecording()
        finish()
    }

    private func finish() {
        recorder = nil
        isRecording = false
        startedAt = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}
