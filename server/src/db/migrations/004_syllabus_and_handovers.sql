-- ==============================================================================
-- Migration: 004_syllabus_and_handovers.sql
-- Purpose  : Syllabus management tracking and faculty work handover records
-- ==============================================================================

-- 1. Syllabuses Table
CREATE TABLE IF NOT EXISTS syllabuses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  department_id INT NOT NULL,
  course_code VARCHAR(50) NOT NULL,
  course_name VARCHAR(200) NOT NULL,
  academic_year VARCHAR(20) NOT NULL,
  semester VARCHAR(30) NOT NULL,
  total_units INT NOT NULL DEFAULT 5,
  completed_units INT NOT NULL DEFAULT 0,
  completion_percentage DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
  status ENUM('Draft', 'In Progress', 'Completed') NOT NULL DEFAULT 'Draft',
  faculty_id INT NULL,
  units JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_syllabuses_department
    FOREIGN KEY (department_id)
    REFERENCES departments(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  CONSTRAINT fk_syllabuses_faculty
    FOREIGN KEY (faculty_id)
    REFERENCES users(id)
    ON DELETE SET NULL
    ON UPDATE CASCADE,
  INDEX idx_syllabuses_dept (department_id),
  INDEX idx_syllabuses_faculty (faculty_id),
  INDEX idx_syllabuses_status (status),
  INDEX idx_syllabuses_course_year (course_code, academic_year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Faculty Handovers Table
CREATE TABLE IF NOT EXISTS handovers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sender_id INT NOT NULL,
  recipient_id INT NOT NULL,
  department_id INT NOT NULL,
  task_id INT NULL,
  title VARCHAR(255) NOT NULL,
  notes TEXT NOT NULL,
  response_notes TEXT NULL,
  status ENUM('Pending', 'Accepted', 'Rejected', 'Completed') NOT NULL DEFAULT 'Pending',
  due_date DATE NULL,
  completed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_handovers_sender
    FOREIGN KEY (sender_id)
    REFERENCES users(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  CONSTRAINT fk_handovers_recipient
    FOREIGN KEY (recipient_id)
    REFERENCES users(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  CONSTRAINT fk_handovers_department
    FOREIGN KEY (department_id)
    REFERENCES departments(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  CONSTRAINT fk_handovers_task
    FOREIGN KEY (task_id)
    REFERENCES tasks(id)
    ON DELETE SET NULL
    ON UPDATE CASCADE,
  INDEX idx_handovers_dept (department_id),
  INDEX idx_handovers_sender (sender_id),
  INDEX idx_handovers_recipient (recipient_id),
  INDEX idx_handovers_task (task_id),
  INDEX idx_handovers_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
