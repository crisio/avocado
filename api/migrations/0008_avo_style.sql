-- Personalidad de Avo: 'picante' (sarcástico, con memes y GIF) o 'tranquilo' (cálido). Picante por omisión.
ALTER TABLE users ADD COLUMN avo_style TEXT NOT NULL DEFAULT 'picante' CHECK (avo_style IN ('picante', 'tranquilo'));
-- GIF de GIPHY con el que Avo remata un mensaje del chat (JSON: id, webp, mp4, still, width, height, title).
ALTER TABLE avo_messages ADD COLUMN gif TEXT;
