-- Accesorio que trae puesto Avo (ver achievements.ts); NULL = sin accesorio.
ALTER TABLE users ADD COLUMN avo_accessory TEXT;

-- Medallas ganadas: una vez ganada se queda, aunque la racha se rompa.
CREATE TABLE achievements (
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  unlocked_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (user_id, key)
);

-- Retos de la semana cumplidos (semana = lunes local "YYYY-MM-DD").
CREATE TABLE challenge_wins (
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  week TEXT NOT NULL,
  key TEXT NOT NULL,
  won_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (user_id, week, key)
);
