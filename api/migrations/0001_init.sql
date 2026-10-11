-- Avocado: esquema inicial (Cloudflare D1 / SQLite)
-- El control de acceso vive en la API (src/access.ts): cada quien ve lo suyo y la nutrióloga
-- solo ve a los pacientes que la vincularon.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  full_name TEXT,
  role TEXT CHECK (role IN ('patient', 'nutritionist')), -- NULL hasta que termina el registro
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Código de 6 dígitos para entrar (uno activo por correo). Se guarda el HMAC, nunca el código.
CREATE TABLE auth_codes (
  email TEXT PRIMARY KEY COLLATE NOCASE,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,      -- epoch ms
  attempts INTEGER NOT NULL DEFAULT 0,
  sent_at INTEGER NOT NULL,         -- epoch ms del último envío
  window_start INTEGER NOT NULL,    -- inicio de la ventana de 1 h para limitar envíos
  sends_in_window INTEGER NOT NULL DEFAULT 1
);

-- Sesiones: se guarda el SHA-256 del token, nunca el token.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,      -- epoch ms
  refreshed_at INTEGER NOT NULL     -- epoch ms
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

CREATE TABLE care_links (
  patient_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  nutritionist_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (patient_id, nutritionist_id)
);
CREATE INDEX care_links_nutritionist_idx ON care_links (nutritionist_id);

CREATE TABLE meals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  eaten_at TEXT NOT NULL,           -- ISO 8601 UTC
  photo_key TEXT NOT NULL,          -- objeto en R2: <user_id>/<uuid>.jpg
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'analyzed', 'error')),
  analysis TEXT,                    -- JSON
  calories REAL,
  protein_g REAL,
  carbs_g REAL,
  fat_g REAL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX meals_user_eaten_idx ON meals (user_id, eaten_at);

CREATE TABLE meal_comments (
  id TEXT PRIMARY KEY,
  meal_id TEXT NOT NULL REFERENCES meals (id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX meal_comments_meal_idx ON meal_comments (meal_id, created_at);
