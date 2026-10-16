-- Recordatorios a la hora de comer: 1 = activados (por omisión). iOS los programa en el teléfono; la web los recibe
-- por Web Push desde el cron.
ALTER TABLE users ADD COLUMN reminders INTEGER NOT NULL DEFAULT 1;
-- Último offset del teléfono (minutos, como getTimezoneOffset) para saber su hora local desde el cron.
ALTER TABLE users ADD COLUMN tz_offset INTEGER;

-- Suscripciones de Web Push (una por navegador).
CREATE TABLE push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX push_subscriptions_user_idx ON push_subscriptions (user_id);

-- Avisos ya mandados por Web Push (uno por paciente, día local y tipo): el cron no repite.
CREATE TABLE reminders_sent (
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  kind TEXT NOT NULL,
  sent_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (user_id, day, kind)
);
