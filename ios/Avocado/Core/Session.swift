import Foundation
import Security

/// Quién está usando la app. El token va en el llavero; el perfil se guarda para abrir al instante (y sin internet).
@Observable
final class Session {
    static let shared = Session()

    private(set) var user: User?

    private static let userKey = "avocado.user"
    private let api = APIClient.shared

    init() {
        let token = Keychain.read()
        api.token = token
        if token != nil,
           let data = UserDefaults.standard.data(forKey: Self.userKey),
           let cached = try? APIClient.decoder.decode(User.self, from: data) {
            user = cached
        }
        // Sesión vencida: la cola se conserva (es del mismo usuario y se envía al volver a entrar).
        api.onUnauthorized = { [weak self] in
            Keychain.delete()
            self?.api.token = nil
            self?.setUser(nil)
        }
    }

    var isSignedIn: Bool { api.token != nil && user != nil }

    func setUser(_ next: User?) {
        user = next
        if let next {
            let encoder = JSONEncoder()
            encoder.keyEncodingStrategy = .convertToSnakeCase
            UserDefaults.standard.set(try? encoder.encode(next), forKey: Self.userKey)
        } else {
            UserDefaults.standard.removeObject(forKey: Self.userKey)
        }
    }

    func signIn(token: String, user: User) {
        Keychain.save(token)
        api.token = token
        setUser(user)
    }

    /// Refresca el perfil en segundo plano (un 401 cierra la sesión).
    func refresh() async {
        guard api.token != nil else { return }
        if let me: User = try? await api.request("GET", "/me") { setUser(me) }
    }

    /// Cambia nombre, rol, meta o permiso para la IA (PATCH /me).
    @discardableResult
    func update(_ fields: [String: Any]) async throws -> User {
        let updated: User = try await api.request("PATCH", "/me", json: fields)
        setUser(updated)
        return updated
    }

    func signOut() async {
        let _: OKResponse? = try? await api.request("POST", "/auth/logout")
        forgetLocal()
    }

    /// Borra la cuenta en el servidor (fotos, comidas, comentarios, vínculos) y todo lo que quedó en el teléfono.
    func deleteAccount() async throws {
        let _: OKResponse = try await api.request("DELETE", "/me", timeout: 60)
        forgetLocal()
    }

    // En un teléfono compartido no deben quedar comidas ni datos de otra cuenta.
    private func forgetLocal() {
        Outbox.shared.clear()
        StreakStore.shared.streak = nil
        ImageStore.shared.clear()
        URLCache.shared.removeAllCachedResponses()
        WidgetSync.clear()
        Keychain.delete()
        api.token = nil
        setUser(nil)
    }
}

/// El token de sesión, en el llavero del teléfono (no se respalda a otros dispositivos).
enum Keychain {
    private static let query: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: "com.cristopherpineda.avocado",
        kSecAttrAccount as String: "session",
    ]

    static func read() -> String? {
        var q = query
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: AnyObject?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let data = out as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func save(_ token: String) {
        delete()
        var q = query
        q[kSecValueData as String] = Data(token.utf8)
        q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(q as CFDictionary, nil)
    }

    static func delete() {
        SecItemDelete(query as CFDictionary)
    }
}
