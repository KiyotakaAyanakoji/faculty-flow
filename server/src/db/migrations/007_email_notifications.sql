-- ==============================================================================
-- Migration: 007_email_notifications.sql
-- Purpose  : Durable notification queue, idempotency, delivery tracking & retry
-- ==============================================================================

CREATE TABLE IF NOT EXISTS email_notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  idempotency_key VARCHAR(255) NOT NULL UNIQUE,
  event_type VARCHAR(100) NOT NULL,
  recipient_email VARCHAR(255) NOT NULL,
  recipient_name VARCHAR(150) NULL,
  recipient_id INT NULL,
  subject VARCHAR(255) NOT NULL,
  template_id VARCHAR(100) NOT NULL,
  payload JSON NOT NULL,
  status ENUM('Pending', 'Processing', 'Sent', 'Failed') NOT NULL DEFAULT 'Pending',
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  next_retry_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  locked_at TIMESTAMP NULL,
  locked_by VARCHAR(100) NULL,
  error_message TEXT NULL,
  sent_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_en_status_retry (status, next_retry_at),
  INDEX idx_en_recipient (recipient_email),
  INDEX idx_en_event_type (event_type),
  INDEX idx_en_created_at (created_at),
  CONSTRAINT fk_en_recipient_user
    FOREIGN KEY (recipient_id)
    REFERENCES users(id)
    ON DELETE SET NULL
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
