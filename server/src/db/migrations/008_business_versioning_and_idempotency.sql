-- ==============================================================================
-- Migration: 008_business_versioning_and_idempotency.sql
-- Purpose  : Add business version numbers to tasks and academic events for reliable notification idempotency
-- ==============================================================================

ALTER TABLE tasks ADD COLUMN version INT NOT NULL DEFAULT 1;
ALTER TABLE academic_events ADD COLUMN version INT NOT NULL DEFAULT 1;
