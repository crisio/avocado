-- Vista de la nutrióloga: metas de macros por paciente, quién puso las metas y código para invitar pacientes.
ALTER TABLE users ADD COLUMN protein_g_goal INTEGER;
ALTER TABLE users ADD COLUMN carbs_g_goal INTEGER;
ALTER TABLE users ADD COLUMN fat_g_goal INTEGER;
-- Nutrióloga que fijó la meta, los macros y el objetivo: mientras estén vinculados, el paciente no los cambia.
ALTER TABLE users ADD COLUMN goals_set_by TEXT REFERENCES users (id) ON DELETE SET NULL;
-- Código de invitación de la nutrióloga (enlace o QR); se crea la primera vez que lo pide.
ALTER TABLE users ADD COLUMN invite_code TEXT;
CREATE UNIQUE INDEX users_invite_code_idx ON users (invite_code);
