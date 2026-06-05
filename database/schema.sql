-- ============================================================
-- DHAS — schema.sql  (v5 — definitive, all column names fixed)
-- Safe to run on BOTH fresh and existing databases.
-- Automatically migrates old `file_name` column to `filename`.
-- ============================================================
CREATE DATABASE IF NOT EXISTS dhas_db;
USE dhas_db;


-- ── users ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    name       VARCHAR(100)        NOT NULL,
    email      VARCHAR(100) UNIQUE NOT NULL,
    password   VARCHAR(255)        NULL DEFAULT NULL,
    provider   VARCHAR(20)         NOT NULL DEFAULT 'local',
    google_id  VARCHAR(100)        NULL UNIQUE,
    created_at TIMESTAMP           DEFAULT CURRENT_TIMESTAMP
);

-- ── user_profiles ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_profiles (
    user_id           INT         PRIMARY KEY,
    phone             VARCHAR(20),
    dob               DATE,
    gender            VARCHAR(20),
    blood_group       VARCHAR(5),
    height            DECIMAL(5,1),
    weight            DECIMAL(5,1),
    conditions        TEXT,
    emergency_contact VARCHAR(200),
    profile_image     MEDIUMTEXT  NULL DEFAULT NULL,
    updated_at        TIMESTAMP   DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ── symptoms ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS symptoms (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    user_id        INT         NOT NULL,
    symptoms       JSON        NOT NULL,
    condition_name VARCHAR(100),
    severity       VARCHAR(20),
    created_at     TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ── Helper procedure for safe index creation ────────────────────
DROP PROCEDURE IF EXISTS dhas_add_index;
DELIMITER //
CREATE PROCEDURE dhas_add_index(
    IN p_table VARCHAR(64),
    IN p_index VARCHAR(64),
    IN p_cols  VARCHAR(200)
)
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.statistics
        WHERE table_schema = DATABASE()
          AND table_name   = p_table
          AND index_name   = p_index
    ) THEN
        SET @sql = CONCAT('ALTER TABLE `', p_table, '` ADD INDEX `', p_index, '` (', p_cols, ')');
        PREPARE stmt FROM @sql;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END //
DELIMITER ;

CALL dhas_add_index('symptoms', 'idx_symptoms_user_id',    'user_id');
CALL dhas_add_index('symptoms', 'idx_symptoms_created_at', 'created_at');


-- ── reminders ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reminders (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    user_id        INT           NOT NULL,
    medicine_name  VARCHAR(150)  NOT NULL,
    schedule_type  VARCHAR(50)   NOT NULL DEFAULT 'daily',
    schedule_label VARCHAR(255)  NOT NULL DEFAULT '',
    dose_count     TINYINT       NOT NULL DEFAULT 1,
    doses_label    VARCHAR(50)   NOT NULL DEFAULT '',
    times          JSON          NOT NULL,
    days           JSON          NULL,
    month_day      INT           NOT NULL DEFAULT 1,
    duration       VARCHAR(20)   NOT NULL DEFAULT 'forever',
    sound          VARCHAR(30)   NOT NULL DEFAULT 'bell',
    start_date     DATE          NOT NULL,
    alt_base       DATETIME      NULL,
    created_at     TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CALL dhas_add_index('reminders', 'idx_reminders_user_id',    'user_id');
CALL dhas_add_index('reminders', 'idx_reminders_start_date', 'start_date');


-- ── reminder_logs ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reminder_logs (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    reminder_id    INT           NOT NULL,
    user_id        INT           NOT NULL,
    scheduled_time DATETIME      NOT NULL,
    status         ENUM('taken', 'missed', 'snoozed') NOT NULL DEFAULT 'taken',
    dose_label     VARCHAR(100)  NOT NULL DEFAULT '',
    logged_at      TIMESTAMP     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_reminder_schedule (reminder_id, scheduled_time),
    FOREIGN KEY (reminder_id) REFERENCES reminders(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id)     REFERENCES users(id)     ON DELETE CASCADE
);

CALL dhas_add_index('reminder_logs', 'idx_logs_reminder_id',    'reminder_id');
CALL dhas_add_index('reminder_logs', 'idx_logs_user_id',        'user_id');
CALL dhas_add_index('reminder_logs', 'idx_logs_scheduled_time', 'scheduled_time');


-- ── reports ─────────────────────────────────────────────────────
-- Column name is `filename` (NO underscore).
-- This block creates the table fresh OR migrates old `file_name` column.
CREATE TABLE IF NOT EXISTS reports (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    user_id     INT          NOT NULL,
    filename    VARCHAR(255) NOT NULL,
    filesize    VARCHAR(20)  DEFAULT '',
    filetype    VARCHAR(50)  DEFAULT '',
    dataurl     LONGTEXT,
    uploaded_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Migration: rename file_name → filename on existing tables
DROP PROCEDURE IF EXISTS dhas_fix_reports_col;
DELIMITER //
CREATE PROCEDURE dhas_fix_reports_col()
BEGIN
    -- If old `file_name` column exists and new `filename` does NOT exist, rename it
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name   = 'reports'
          AND column_name  = 'file_name'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name   = 'reports'
          AND column_name  = 'filename'
    ) THEN
        ALTER TABLE reports CHANGE `file_name` `filename` VARCHAR(255) NOT NULL DEFAULT '';
    END IF;

    -- Also ensure filesize and filetype have defaults (older schemas may not)
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name   = 'reports'
          AND column_name  = 'filesize'
          AND is_nullable  = 'YES'
    ) THEN
        ALTER TABLE reports MODIFY filesize VARCHAR(20) DEFAULT '';
    END IF;
END //
DELIMITER ;
CALL dhas_fix_reports_col();
DROP PROCEDURE IF EXISTS dhas_fix_reports_col;

CALL dhas_add_index('reports', 'idx_reports_user_id',     'user_id');
CALL dhas_add_index('reports', 'idx_reports_uploaded_at', 'uploaded_at');


-- ── password_reset_tokens ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    user_id    INT          NOT NULL,
    token      VARCHAR(64)  NOT NULL UNIQUE,
    expires_at DATETIME     NOT NULL,
    used       TINYINT(1)   NOT NULL DEFAULT 0,
    created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CALL dhas_add_index('password_reset_tokens', 'idx_prt_token',   'token');
CALL dhas_add_index('password_reset_tokens', 'idx_prt_user_id', 'user_id');

-- Cleanup helper procedure
DROP PROCEDURE IF EXISTS dhas_add_index;