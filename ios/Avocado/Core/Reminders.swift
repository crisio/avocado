import SwiftUI
import UserNotifications

/// Un aviso que manda la API (ya con la voz de Avo): a la hora de desayuno, comida o cena, o para no perder la racha.
struct ReminderItem: Decodable, Equatable {
    var id: String
    var kind: String
    var at: String
    var title: String
    var body: String
}

private struct RemindersResponse: Decodable {
    var enabled: Bool
    var reminders: [ReminderItem]
}

/**
 Recordatorios a la hora de comer, como notificaciones locales (sin APNs): la API dice qué avisar en los próximos 7 días
 (sin lo que ya registraste) y aquí se programan en el teléfono. Se vuelven a pedir al abrir la app, al entrar, al subir
 una comida y al cambiar el ajuste, para que el aviso de una comida ya registrada desaparezca.
 */
@Observable
final class ReminderScheduler {
    static let shared = ReminderScheduler()

    static let prefix = "avo-reminder-"

    private(set) var status: UNAuthorizationStatus = .notDetermined
    /// Lo que quedó programado, para mostrar "Próximo: …" en Perfil.
    private(set) var scheduled: [ReminderItem] = []

    private var lastRefresh = Date.distantPast
    private var running = false
    private let center = UNUserNotificationCenter.current()

    var allowed: Bool { status == .authorized || status == .provisional || status == .ephemeral }

    var next: ReminderItem? {
        scheduled.first { Fmt.date($0.at) > .now }
    }

    func loadStatus() async {
        status = await center.notificationSettings().authorizationStatus
    }

    /// Vuelve a programar. Sin `force` no repite si hace menos de 30 s.
    func refresh(force: Bool = false) async {
        await loadStatus()
        guard let user = Session.shared.user, user.role == .patient, user.remindersOn, allowed else {
            await clear()
            return
        }
        guard !running, force || Date.now.timeIntervalSince(lastRefresh) > 30 else { return }
        running = true
        defer { running = false }
        lastRefresh = .now
        guard let response: RemindersResponse = try? await APIClient.shared.request(
            "GET", "/reminders", query: ["offset": String(Fmt.timezoneOffset), "days": "7"]
        ) else { return }
        await removePending()
        guard response.enabled else {
            scheduled = []
            return
        }
        var done: [ReminderItem] = []
        for item in response.reminders.sorted(by: { $0.at < $1.at }).prefix(28) {
            let date = Fmt.date(item.at)
            guard date > .now.addingTimeInterval(5) else { continue }
            let content = UNMutableNotificationContent()
            content.title = item.title
            content.body = item.body
            content.sound = .default
            content.threadIdentifier = "avo-reminders"
            content.userInfo = ["url": "avocado://nueva"]
            let parts = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute, .second], from: date)
            let trigger = UNCalendarNotificationTrigger(dateMatching: parts, repeats: false)
            do {
                try await center.add(UNNotificationRequest(identifier: Self.prefix + item.id, content: content, trigger: trigger))
                done.append(item)
            } catch {}
        }
        scheduled = done
    }

    /// Quita todo lo programado (ajuste apagado, sin permiso o sesión cerrada).
    func clear() async {
        await removePending()
        scheduled = []
    }

    private func removePending() async {
        let ids = await center.pendingNotificationRequests().map(\.identifier).filter { $0.hasPrefix(Self.prefix) }
        center.removePendingNotificationRequests(withIdentifiers: ids)
    }

    /// Pide el permiso del sistema (si falta), enciende el ajuste en la cuenta y programa. false = no hay permiso.
    @discardableResult
    func enable() async -> Bool {
        await loadStatus()
        if status == .notDetermined {
            _ = try? await center.requestAuthorization(options: [.alert, .sound, .badge])
            await loadStatus()
        }
        guard allowed else { return false }
        if Session.shared.user?.reminders != true {
            do { try await Session.shared.update(["reminders": true]) } catch { return false }
        }
        await refresh(force: true)
        return true
    }

    /// Apaga el ajuste en la cuenta y quita lo programado.
    func disable() async {
        _ = try? await Session.shared.update(["reminders": false])
        await clear()
    }
}

/// Muestra los avisos como banner con la app abierta y, al tocarlos, abre la cámara (avocado://nueva).
final class NotificationDelegate: NSObject, UNUserNotificationCenterDelegate {
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .sound]
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        guard let link = response.notification.request.content.userInfo["url"] as? String, let url = URL(string: link) else { return }
        await MainActor.run { AppRoute.shared.open(url) }
    }
}
