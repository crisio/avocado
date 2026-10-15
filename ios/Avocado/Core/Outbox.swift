import Foundation
import Network
import UIKit

/// Una comida que sigue en el teléfono: se guarda aquí primero y se sube en cuanto hay señal.
struct MealJob: Codable, Identifiable, Equatable {
    var id: String
    var userId: String
    var eatenAt: Date
    var note: String?
    var createdAt: Date
    var attempts = 0
    /// Error permanente (el servidor rechazó el envío); no se reintenta solo.
    var error: String?
}

/**
 Cola de envíos. Cada comida se guarda primero en el teléfono (foto en disco) y se manda en cuanto hay conexión.
 Lleva un id generado aquí (client_id), así un reintento después de una conexión cortada no la duplica en el
 servidor. Al subirla, el servidor arranca el análisis con IA por su cuenta (analyze=1).
 */
@Observable
final class Outbox {
    static let shared = Outbox()

    private(set) var jobs: [MealJob] = []
    private(set) var sending: String?
    /// Sube cada vez que una comida llega al servidor (las vistas lo usan para recargar).
    private(set) var syncedCount = 0

    private let folder: URL
    private var listFile: URL { folder.appending(path: "jobs.json") }
    private var photos: [String: UIImage] = [:]

    init() {
        folder = URL.applicationSupportDirectory.appending(path: "outbox", directoryHint: .isDirectory)
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        if let data = try? Data(contentsOf: listFile), let saved = try? Self.decoder.decode([MealJob].self, from: data) {
            jobs = saved.sorted { $0.createdAt < $1.createdAt }
        }
    }

    func photoURL(_ id: String) -> URL { folder.appending(path: "\(id).jpg") }

    func photo(_ id: String) -> UIImage? {
        if let cached = photos[id] { return cached }
        let image = UIImage(contentsOfFile: photoURL(id).path())
        photos[id] = image
        return image
    }

    func enqueue(_ job: MealJob, jpeg: Data) throws {
        try jpeg.write(to: photoURL(job.id), options: .atomic)
        jobs.append(job)
        save()
        Task { await flush() }
    }

    func retry(_ id: String) {
        guard let i = jobs.firstIndex(where: { $0.id == id }) else { return }
        jobs[i].error = nil
        save()
        Task { await flush() }
    }

    func discard(_ id: String) {
        jobs.removeAll { $0.id == id }
        try? FileManager.default.removeItem(at: photoURL(id))
        photos[id] = nil
        save()
    }

    func clear() {
        for job in jobs { try? FileManager.default.removeItem(at: photoURL(job.id)) }
        jobs = []
        photos = [:]
        save()
    }

    /// Manda lo pendiente, una por una y en orden. Sin conexión se detiene y espera al siguiente intento.
    func flush() async {
        guard sending == nil, APIClient.shared.token != nil else { return }
        while let job = jobs.first(where: { $0.error == nil }) {
            sending = job.id
            defer { sending = nil }
            do {
                try await upload(job)
                discard(job.id)
                syncedCount += 1
            } catch let error as APIError where error.status == 0 || error.status == 401 || error.status >= 500 {
                bumpAttempts(job.id)
                return
            } catch {
                guard let i = jobs.firstIndex(where: { $0.id == job.id }) else { return }
                jobs[i].error = error.localizedDescription
                save()
            }
        }
    }

    private func upload(_ job: MealJob) async throws {
        guard let jpeg = try? Data(contentsOf: photoURL(job.id)) else { throw APIError(message: "No se encontró la foto en el teléfono", status: 400) }
        var form = MultipartForm()
        form.addJPEG("photo", filename: "comida.jpg", data: jpeg)
        form.add("eaten_at", Fmt.iso(job.eatenAt))
        if let note = job.note { form.add("note", note) }
        form.add("client_id", job.id)
        form.add("analyze", "1")
        form.add("offset", String(Fmt.timezoneOffset))
        let _: Meal = try await APIClient.shared.request("POST", "/meals", form: form, timeout: 60)
    }

    private func bumpAttempts(_ id: String) {
        guard let i = jobs.firstIndex(where: { $0.id == id }) else { return }
        jobs[i].attempts += 1
        save()
    }

    private func save() {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        try? encoder.encode(jobs).write(to: listFile, options: .atomic)
    }

    private static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }()
}

/// ¿Hay internet? Al volver la señal, la cola se manda sola.
@Observable
final class Connectivity {
    static let shared = Connectivity()

    private(set) var online = true
    private let monitor = NWPathMonitor()

    init() {
        monitor.pathUpdateHandler = { [weak self] path in
            let online = path.status == .satisfied
            Task { @MainActor in
                guard let self, self.online != online else { return }
                self.online = online
                if online { await Outbox.shared.flush() }
            }
        }
        monitor.start(queue: .main)
    }
}
