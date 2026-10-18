-- Cómo cocinó la comida (aceite, cantidad, método…), aparte de la nota: la IA lo usa para la grasa que no se ve.
ALTER TABLE meals ADD COLUMN cooking TEXT;

-- Dictados por audio de cada paciente por día (para poner un tope: cada uno cuesta una llamada a la IA).
CREATE TABLE transcriptions (
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);
