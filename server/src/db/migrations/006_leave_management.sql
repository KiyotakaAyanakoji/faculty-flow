-- ==============================================================================
-- Migration: 006_leave_management.sql
-- Purpose  : Faculty leave types, entitlements, requests, and approval workflow
-- ==============================================================================

-- 1. Leave Types & Policy Table
CREATE TABLE IF NOT EXISTS leave_types (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  description TEXT NULL,
  is_paid BOOLEAN NOT NULL DEFAULT TRUE,
  default_days_per_year DECIMAL(5, 1) NOT NULL DEFAULT 12.0,
  requires_approval BOOLEAN NOT NULL DEFAULT TRUE,
  allow_half_day BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_lt_code (code),
  INDEX idx_lt_is_paid (is_paid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Leave Balances & Entitlements Table
CREATE TABLE IF NOT EXISTS leave_balances (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  leave_type_id INT NOT NULL,
  academic_year VARCHAR(20) NOT NULL DEFAULT '2026-2027',
  entitled_days DECIMAL(5, 1) NOT NULL DEFAULT 0.0,
  used_days DECIMAL(5, 1) NOT NULL DEFAULT 0.0,
  pending_days DECIMAL(5, 1) NOT NULL DEFAULT 0.0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_lb_user
    FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_lb_type
    FOREIGN KEY (leave_type_id)
    REFERENCES leave_types(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  UNIQUE KEY uq_user_leave_year (user_id, leave_type_id, academic_year),
  INDEX idx_lb_user (user_id),
  INDEX idx_lb_type (leave_type_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Leave Requests Table
CREATE TABLE IF NOT EXISTS leave_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  department_id INT NOT NULL,
  leave_type_id INT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  days_count DECIMAL(5, 1) NOT NULL,
  is_half_day BOOLEAN NOT NULL DEFAULT FALSE,
  half_day_period ENUM('First Half', 'Second Half') NULL,
  reason TEXT NOT NULL,
  status ENUM('Pending', 'Approved', 'Rejected', 'Cancelled') NOT NULL DEFAULT 'Pending',
  approver_id INT NULL,
  decision_notes TEXT NULL,
  decision_timestamp TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_lr_user
    FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  CONSTRAINT fk_lr_department
    FOREIGN KEY (department_id)
    REFERENCES departments(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  CONSTRAINT fk_lr_type
    FOREIGN KEY (leave_type_id)
    REFERENCES leave_types(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  CONSTRAINT fk_lr_approver
    FOREIGN KEY (approver_id)
    REFERENCES users(id)
    ON DELETE SET NULL
    ON UPDATE CASCADE,
  INDEX idx_lr_user_status (user_id, status),
  INDEX idx_lr_dept_status (department_id, status),
  INDEX idx_lr_dates (start_date, end_date),
  INDEX idx_lr_approver (approver_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Leave Audit & Adjustment History Table
CREATE TABLE IF NOT EXISTS leave_audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  request_id INT NULL,
  user_id INT NOT NULL,
  action VARCHAR(50) NOT NULL,
  previous_status VARCHAR(50) NULL,
  new_status VARCHAR(50) NULL,
  performed_by INT NOT NULL,
  notes TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_lal_request
    FOREIGN KEY (request_id)
    REFERENCES leave_requests(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_lal_user
    FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_lal_performer
    FOREIGN KEY (performed_by)
    REFERENCES users(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  INDEX idx_lal_request (request_id),
  INDEX idx_lal_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Default Leave Types Seeding
INSERT INTO leave_types (code, name, description, is_paid, default_days_per_year, requires_approval, allow_half_day)
VALUES
  ('CASUAL', 'Casual Leave', 'Short-term personal or unforeseen leaves', TRUE, 12.0, TRUE, TRUE),
  ('SICK', 'Sick / Medical Leave', 'Medical or health-related absence', TRUE, 10.0, TRUE, TRUE),
  ('EARNED', 'Earned / Annual Leave', 'Accrued annual vacation and personal time', TRUE, 15.0, TRUE, FALSE),
  ('UNPAID', 'Unpaid Leave (LWP)', 'Leave without pay for extended absence or zero balance', FALSE, 0.0, TRUE, TRUE)
ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description);
