import Foundation

enum Config {
    /// API de Avocado (Cloudflare Worker), la misma que usa la app web.
    /// En Debug se puede apuntar a la API local (`cd api && npm run dev`):
    /// `xcrun simctl spawn booted defaults write com.cristopherpineda.avocado AVOCADO_API_URL http://localhost:8787`
    static let apiURL: URL = {
        #if DEBUG
        if let custom = UserDefaults.standard.string(forKey: "AVOCADO_API_URL"), let url = URL(string: custom) { return url }
        #endif
        return URL(string: "https://avocado-api.cristopheropineda.workers.dev")!
    }()

    static let webURL = URL(string: "https://avocadoapp.cristopherpineda.com")!
    static let privacyURL = URL(string: "https://avocadoapp.cristopherpineda.com/privacidad.html")!
}
