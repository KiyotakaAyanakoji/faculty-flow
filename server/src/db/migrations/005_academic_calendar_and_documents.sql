-- ==============================================================================
-- Migration: 005_academic_calendar_and_documents.sql
-- Purpose  : Academic calendar events, faculty participants, and secure document attachments
-- ==============================================================================

-- 1. Academic Events Table
CREATE TABLE IF NOT EXISTS academic_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  category ENUM('Exam', 'Meeting', 'Holiday', 'Submission', 'Conference', 'Workshop') NOT NULL,
  start_time DATETIME NOT NULL,
  end_time DATETIME NOT NULL,
  is_all_day BOOLEAN NOT NULL DEFAULT FALSE,
  location VARCHAR(255) NULL,
  meeting_link VARCHAR(500) NULL,
  department_id INT NULL,
  creator_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_events_department
    FOREIGN KEY (department_id)
    REFERENCES departments(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  CONSTRAINT fk_events_creator
    FOREIGN KEY (creator_id)
    REFERENCES users(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  INDEX idx_events_department (department_id),
  INDEX idx_events_creator (creator_id),
  INDEX idx_events_category (category),
  INDEX idx_events_start_end (start_time, end_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Event Participants Table
CREATE TABLE IF NOT EXISTS event_participants (
  id INT AUTO_INCREMENT PRIMARY KEY,
  event_id INT NOT NULL,
  user_id INT NOT NULL,
  status ENUM('Invited', 'Accepted', 'Declined', 'Tentative') NOT NULL DEFAULT 'Invited',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_participants_event
    FOREIGN KEY (event_id)
    REFERENCES academic_events(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_participants_user
    FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  UNIQUE KEY uq_event_participant (event_id, user_id),
  INDEX idx_participants_event (event_id),
  INDEX idx_participants_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Event Documents Table
CREATE TABLE IF NOT EXISTS event_documents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  event_id INT NOT NULL,
  file_identifier VARCHAR(100) NOT NULL UNIQUE,
  original_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL DEFAULT 'application/pdf',
  file_size INT NOT NULL,
  uploader_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_documents_event
    FOREIGN KEY (event_id)
    REFERENCES academic_events(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_documents_uploader
    FOREIGN KEY (uploader_id)
    REFERENCES users(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  INDEX idx_documents_event (event_id),
  INDEX idx_documents_uploader (uploader_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
