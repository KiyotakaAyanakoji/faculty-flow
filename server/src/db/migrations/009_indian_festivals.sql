-- ==============================================================================
-- Migration: 009_indian_festivals.sql
-- Purpose  : Indian National Holidays, Gazetted Festivals, and Club activities category
-- ==============================================================================

-- 1. Extend category ENUM on academic_events to support Club activities
ALTER TABLE academic_events 
  MODIFY COLUMN category ENUM('Exam', 'Meeting', 'Holiday', 'Submission', 'Conference', 'Workshop', 'Club') NOT NULL;

-- 2. Dedicated Indian National Holidays and Festivals Table
CREATE TABLE IF NOT EXISTS indian_holidays (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  date DATE NOT NULL,
  year INT NOT NULL,
  holiday_type ENUM('National Holiday', 'Gazetted Festival') NOT NULL,
  description VARCHAR(500) NULL,
  source_key VARCHAR(100) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_holidays_year (year),
  INDEX idx_holidays_date (date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Populate Year-Aware Maintained Dataset (2025, 2026, 2027)
INSERT INTO indian_holidays (name, date, year, holiday_type, description, source_key) VALUES
-- 2025
('Makar Sankranti / Pongal', '2025-01-14', 2025, 'Gazetted Festival', 'Celebration of harvest and sun transition into Capricorn', 'IN_2025_MAKAR_SANKRANTI'),
('Republic Day', '2025-01-26', 2025, 'National Holiday', 'Commemoration of the Constitution of India coming into effect', 'IN_2025_REPUBLIC_DAY'),
('Maha Shivratri', '2025-02-26', 2025, 'Gazetted Festival', 'Great Night of Shiva annual observance', 'IN_2025_MAHA_SHIVRATRI'),
('Holi', '2025-03-14', 2025, 'Gazetted Festival', 'Festival of colors celebrating the arrival of spring', 'IN_2025_HOLI'),
('Id-ul-Fitr (Ramzan Id)', '2025-03-31', 2025, 'Gazetted Festival', 'Islamic festival marking the culmination of the holy month of Ramadan', 'IN_2025_ID_UL_FITR'),
('Mahavir Jayanti', '2025-04-10', 2025, 'Gazetted Festival', 'Birth anniversary of Bhagwan Mahavira in Jain tradition', 'IN_2025_MAHAVIR_JAYANTI'),
('Good Friday', '2025-04-18', 2025, 'Gazetted Festival', 'Christian solemn observance of the passion and crucifixion of Jesus', 'IN_2025_GOOD_FRIDAY'),
('Buddha Purnima', '2025-05-12', 2025, 'Gazetted Festival', 'Birth, enlightenment, and passing of Gautama Buddha', 'IN_2025_BUDDHA_PURNIMA'),
('Id-ul-Zuha (Bakrid)', '2025-06-07', 2025, 'Gazetted Festival', 'Feast of the Sacrifice observed in Islamic tradition', 'IN_2025_BAKRID'),
('Muharram', '2025-07-06', 2025, 'Gazetted Festival', 'First month of the Islamic calendar and Day of Ashura', 'IN_2025_MUHARRAM'),
('Independence Day', '2025-08-15', 2025, 'National Holiday', 'Commemoration of Indian independence from colonial rule in 1947', 'IN_2025_INDEPENDENCE_DAY'),
('Janmashtami', '2025-08-16', 2025, 'Gazetted Festival', 'Celebration of the birth of Lord Krishna', 'IN_2025_JANMASHTAMI'),
('Milad-un-Nabi (Id-e-Milad)', '2025-09-05', 2025, 'Gazetted Festival', 'Observance of the birthday of the Prophet Muhammad', 'IN_2025_EID_E_MILAD'),
('Mahatma Gandhi Jayanti', '2025-10-02', 2025, 'National Holiday', 'Birth anniversary of Mahatma Gandhi, Father of the Nation', 'IN_2025_GANDHI_JAYANTI'),
('Dussehra (Vijay Dashami)', '2025-10-02', 2025, 'Gazetted Festival', 'Celebration of the victory of good over evil', 'IN_2025_DUSSEHRA'),
('Diwali (Deepavali)', '2025-10-20', 2025, 'Gazetted Festival', 'Festival of lights celebrating auspiciousness, knowledge, and prosperity', 'IN_2025_DIWALI'),
('Guru Nanak Jayanti', '2025-11-05', 2025, 'Gazetted Festival', 'Birth anniversary of Guru Nanak Dev Ji, founder of Sikhism', 'IN_2025_GURU_NANAK_JAYANTI'),
('Christmas Day', '2025-12-25', 2025, 'Gazetted Festival', 'Christian celebration of the birth of Jesus Christ', 'IN_2025_CHRISTMAS'),

-- 2026
('Makar Sankranti / Pongal', '2026-01-14', 2026, 'Gazetted Festival', 'Celebration of harvest and sun transition into Capricorn', 'IN_2026_MAKAR_SANKRANTI'),
('Republic Day', '2026-01-26', 2026, 'National Holiday', 'Commemoration of the Constitution of India coming into effect', 'IN_2026_REPUBLIC_DAY'),
('Maha Shivratri', '2026-02-15', 2026, 'Gazetted Festival', 'Great Night of Shiva annual observance', 'IN_2026_MAHA_SHIVRATRI'),
('Holi', '2026-03-04', 2026, 'Gazetted Festival', 'Festival of colors celebrating the arrival of spring', 'IN_2026_HOLI'),
('Id-ul-Fitr (Ramzan Id)', '2026-03-20', 2026, 'Gazetted Festival', 'Islamic festival marking the culmination of the holy month of Ramadan', 'IN_2026_ID_UL_FITR'),
('Mahavir Jayanti', '2026-03-31', 2026, 'Gazetted Festival', 'Birth anniversary of Bhagwan Mahavira in Jain tradition', 'IN_2026_MAHAVIR_JAYANTI'),
('Good Friday', '2026-04-03', 2026, 'Gazetted Festival', 'Christian solemn observance of the passion and crucifixion of Jesus', 'IN_2026_GOOD_FRIDAY'),
('Buddha Purnima', '2026-05-01', 2026, 'Gazetted Festival', 'Birth, enlightenment, and passing of Gautama Buddha', 'IN_2026_BUDDHA_PURNIMA'),
('Id-ul-Zuha (Bakrid)', '2026-05-27', 2026, 'Gazetted Festival', 'Feast of the Sacrifice observed in Islamic tradition', 'IN_2026_BAKRID'),
('Muharram', '2026-06-25', 2026, 'Gazetted Festival', 'First month of the Islamic calendar and Day of Ashura', 'IN_2026_MUHARRAM'),
('Independence Day', '2026-08-15', 2026, 'National Holiday', 'Commemoration of Indian independence from colonial rule in 1947', 'IN_2026_INDEPENDENCE_DAY'),
('Milad-un-Nabi (Id-e-Milad)', '2026-08-25', 2026, 'Gazetted Festival', 'Observance of the birthday of the Prophet Muhammad', 'IN_2026_EID_E_MILAD'),
('Janmashtami', '2026-09-04', 2026, 'Gazetted Festival', 'Celebration of the birth of Lord Krishna', 'IN_2026_JANMASHTAMI'),
('Mahatma Gandhi Jayanti', '2026-10-02', 2026, 'National Holiday', 'Birth anniversary of Mahatma Gandhi, Father of the Nation', 'IN_2026_GANDHI_JAYANTI'),
('Dussehra (Vijay Dashami)', '2026-10-20', 2026, 'Gazetted Festival', 'Celebration of the victory of good over evil', 'IN_2026_DUSSEHRA'),
('Diwali (Deepavali)', '2026-11-08', 2026, 'Gazetted Festival', 'Festival of lights celebrating auspiciousness, knowledge, and prosperity', 'IN_2026_DIWALI'),
('Guru Nanak Jayanti', '2026-11-24', 2026, 'Gazetted Festival', 'Birth anniversary of Guru Nanak Dev Ji, founder of Sikhism', 'IN_2026_GURU_NANAK_JAYANTI'),
('Christmas Day', '2026-12-25', 2026, 'Gazetted Festival', 'Christian celebration of the birth of Jesus Christ', 'IN_2026_CHRISTMAS'),

-- 2027
('Makar Sankranti / Pongal', '2027-01-14', 2027, 'Gazetted Festival', 'Celebration of harvest and sun transition into Capricorn', 'IN_2027_MAKAR_SANKRANTI'),
('Republic Day', '2027-01-26', 2027, 'National Holiday', 'Commemoration of the Constitution of India coming into effect', 'IN_2027_REPUBLIC_DAY'),
('Maha Shivratri', '2027-03-06', 2027, 'Gazetted Festival', 'Great Night of Shiva annual observance', 'IN_2027_MAHA_SHIVRATRI'),
('Id-ul-Fitr (Ramzan Id)', '2027-03-10', 2027, 'Gazetted Festival', 'Islamic festival marking the culmination of the holy month of Ramadan', 'IN_2027_ID_UL_FITR'),
('Holi', '2027-03-22', 2027, 'Gazetted Festival', 'Festival of colors celebrating the arrival of spring', 'IN_2027_HOLI'),
('Good Friday', '2027-03-26', 2027, 'Gazetted Festival', 'Christian solemn observance of the passion and crucifixion of Jesus', 'IN_2027_GOOD_FRIDAY'),
('Mahavir Jayanti', '2027-04-19', 2027, 'Gazetted Festival', 'Birth anniversary of Bhagwan Mahavira in Jain tradition', 'IN_2027_MAHAVIR_JAYANTI'),
('Id-ul-Zuha (Bakrid)', '2027-05-17', 2027, 'Gazetted Festival', 'Feast of the Sacrifice observed in Islamic tradition', 'IN_2027_BAKRID'),
('Buddha Purnima', '2027-05-20', 2027, 'Gazetted Festival', 'Birth, enlightenment, and passing of Gautama Buddha', 'IN_2027_BUDDHA_PURNIMA'),
('Muharram', '2027-06-15', 2027, 'Gazetted Festival', 'First month of the Islamic calendar and Day of Ashura', 'IN_2027_MUHARRAM'),
('Milad-un-Nabi (Id-e-Milad)', '2027-08-14', 2027, 'Gazetted Festival', 'Observance of the birthday of the Prophet Muhammad', 'IN_2027_EID_E_MILAD'),
('Independence Day', '2027-08-15', 2027, 'National Holiday', 'Commemoration of Indian independence from colonial rule in 1947', 'IN_2027_INDEPENDENCE_DAY'),
('Janmashtami', '2027-08-25', 2027, 'Gazetted Festival', 'Celebration of the birth of Lord Krishna', 'IN_2027_JANMASHTAMI'),
('Mahatma Gandhi Jayanti', '2027-10-02', 2027, 'National Holiday', 'Birth anniversary of Mahatma Gandhi, Father of the Nation', 'IN_2027_GANDHI_JAYANTI'),
('Dussehra (Vijay Dashami)', '2027-10-09', 2027, 'Gazetted Festival', 'Celebration of the victory of good over evil', 'IN_2027_DUSSEHRA'),
('Diwali (Deepavali)', '2027-10-29', 2027, 'Gazetted Festival', 'Festival of lights celebrating auspiciousness, knowledge, and prosperity', 'IN_2027_DIWALI'),
('Guru Nanak Jayanti', '2027-11-14', 2027, 'Gazetted Festival', 'Birth anniversary of Guru Nanak Dev Ji, founder of Sikhism', 'IN_2027_GURU_NANAK_JAYANTI'),
('Christmas Day', '2027-12-25', 2027, 'Gazetted Festival', 'Christian celebration of the birth of Jesus Christ', 'IN_2027_CHRISTMAS')
ON DUPLICATE KEY UPDATE 
  name = VALUES(name),
  date = VALUES(date),
  year = VALUES(year),
  holiday_type = VALUES(holiday_type),
  description = VALUES(description);
