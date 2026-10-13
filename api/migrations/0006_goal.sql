-- Objetivo del paciente: bajar de peso, mantener o subir (volumen). Con su meta diaria, define el saldo de la semana
-- y la comida libre (cheat meal) que Avo le puede recomendar. NULL = no lo ha elegido.
ALTER TABLE users ADD COLUMN goal TEXT CHECK (goal IN ('bajar', 'mantener', 'subir'));
