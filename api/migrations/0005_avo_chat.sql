-- Conversación del paciente con Avo, por texto o audio. El audio no se guarda: solo lo que dijo (transcrito por la IA).
-- La conversación es privada; lo que Avo detecta de cómo se siente queda en moods y eso sí lo ve su nutrióloga.
CREATE TABLE avo_messages (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'avo')),
  body TEXT NOT NULL,
  via_audio INTEGER NOT NULL DEFAULT 0,
  mood_id TEXT REFERENCES moods (id) ON DELETE SET NULL, -- lo que Avo anotó de cómo se siente
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX avo_messages_user_idx ON avo_messages (user_id, created_at);
