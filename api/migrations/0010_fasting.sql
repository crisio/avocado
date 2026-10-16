-- Ayuno intermitente: horas de ayuno del plan (16 = 16:8); NULL = sin ayuno.
ALTER TABLE users ADD COLUMN fasting_hours INTEGER CHECK (fasting_hours BETWEEN 12 AND 23);
-- Hora local "HH:MM" en que abre su ventana de comida.
ALTER TABLE users ADD COLUMN eating_start TEXT;
-- "Empecé mi ayuno a las…" (ISO): por si no registró su última comida.
ALTER TABLE users ADD COLUMN fast_started_at TEXT;
