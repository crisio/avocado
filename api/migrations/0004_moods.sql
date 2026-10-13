-- Cómo se siente el paciente (con hambre, ansioso, lleno…), su energía y si va con el plan de su nutrióloga.
-- Lo ve su nutrióloga. Con permiso para la IA, Avo lo usa para aconsejarle y encontrar sus patrones.
CREATE TABLE moods (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  felt_at TEXT NOT NULL,            -- ISO 8601 UTC
  feelings TEXT NOT NULL,           -- JSON: ["con_hambre", "ansioso"]
  energy INTEGER CHECK (energy BETWEEN 1 AND 5),
  on_plan TEXT CHECK (on_plan IN ('si', 'a_medias', 'no')),
  note TEXT,
  meal_id TEXT REFERENCES meals (id) ON DELETE SET NULL, -- la comida después de la que se registró
  advice TEXT,                      -- JSON: consejo de Avo { message, tips, model }
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX moods_user_felt_idx ON moods (user_id, felt_at);
