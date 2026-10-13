-- Meta diaria de calorías (opcional). La pone el paciente con lo que le indicó su nutrióloga;
-- Avo la usa para aconsejar con los antojos ("¿Me lo como?").
ALTER TABLE users ADD COLUMN daily_kcal_goal INTEGER;
