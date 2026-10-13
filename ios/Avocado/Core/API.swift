import Foundation

/// Error para mostrar al usuario: el mensaje viene del servidor (en español). status 0 = sin conexión.
struct APIError: LocalizedError {
    let message: String
    let status: Int
    var errorDescription: String? { message }

    static let offline = APIError(message: "Sin conexión. Revisa tu internet.", status: 0)
}

/// Respuestas como `{ "ok": true }`.
struct OKResponse: Decodable {}

/// Formulario multipart para mandar fotos.
struct MultipartForm {
    private let boundary = "avocado-\(UUID().uuidString)"
    private var body = Data()

    var contentType: String { "multipart/form-data; boundary=\(boundary)" }

    mutating func add(_ name: String, _ value: String) {
        body.append(text: "--\(boundary)\r\nContent-Disposition: form-data; name=\"\(name)\"\r\n\r\n\(value)\r\n")
    }

    mutating func addJPEG(_ name: String, filename: String, data: Data) {
        addFile(name, filename: filename, mimeType: "image/jpeg", data: data)
    }

    mutating func addFile(_ name: String, filename: String, mimeType: String, data: Data) {
        body.append(text: "--\(boundary)\r\nContent-Disposition: form-data; name=\"\(name)\"; filename=\"\(filename)\"\r\nContent-Type: \(mimeType)\r\n\r\n")
        body.append(data)
        body.append(text: "\r\n")
    }

    var data: Data {
        var out = body
        out.append(text: "--\(boundary)--\r\n")
        return out
    }
}

private extension Data {
    mutating func append(text: String) { append(Data(text.utf8)) }
}

/// Cliente de la API con el token de sesión (Bearer).
final class APIClient {
    static let shared = APIClient()

    var token: String?
    /// Sesión vencida o inválida (401): la app regresa a la pantalla de entrar.
    var onUnauthorized: (() -> Void)?

    static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return decoder
    }()

    func request<T: Decodable>(
        _ method: String = "GET",
        _ path: String,
        query: [String: String] = [:],
        json: [String: Any]? = nil,
        form: MultipartForm? = nil,
        timeout: TimeInterval = 20
    ) async throws -> T {
        var components = URLComponents(url: Config.apiURL.appending(path: path), resolvingAgainstBaseURL: false)!
        if !query.isEmpty { components.queryItems = query.sorted { $0.key < $1.key }.map { URLQueryItem(name: $0.key, value: $0.value) } }

        var request = URLRequest(url: components.url!, timeoutInterval: timeout)
        request.httpMethod = method
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        if let json {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: json)
        } else if let form {
            request.setValue(form.contentType, forHTTPHeaderField: "Content-Type")
            request.httpBody = form.data
        }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await URLSession.shared.data(for: request)
        } catch let error as URLError where error.code == .cancelled {
            throw CancellationError()
        } catch is CancellationError {
            throw CancellationError()
        } catch {
            throw APIError.offline
        }

        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            let body = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
            if status == 401, token != nil { onUnauthorized?() }
            throw APIError(message: body?["error"] as? String ?? "Error \(status)", status: status)
        }
        do {
            return try Self.decoder.decode(T.self, from: data)
        } catch {
            throw APIError(message: "El servidor respondió algo inesperado. Intenta de nuevo.", status: status)
        }
    }
}
