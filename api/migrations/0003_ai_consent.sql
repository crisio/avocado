-- Permiso del paciente para mandar sus fotos y notas a la IA (OpenRouter → Google y OpenAI).
-- NULL = no lo ha dado; sin él la API no analiza nada (App Store 5.1.2(i)).
ALTER TABLE users ADD COLUMN ai_consent_at TEXT;
