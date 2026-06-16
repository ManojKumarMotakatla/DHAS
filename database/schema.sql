-- ============================================================
-- DHAS — schema.sql  (v8 — auto-verified doctors, no consultation_fee)
--
-- Changes from v7:
--   • doctors.is_verified default changed to 1 (auto-verified on register)
--   • consultation_fee column removed from doctors table
--   • Migration procedure handles existing DBs safely
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


-- ── Helper: safe index creation ─────────────────────────────────
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
CREATE TABLE IF NOT EXISTS reports (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    user_id     INT          NOT NULL,
    filename    VARCHAR(255) NOT NULL DEFAULT '',
    filesize    VARCHAR(20)  NOT NULL DEFAULT '',
    filetype    VARCHAR(50)  NOT NULL DEFAULT '',
    dataurl     LONGTEXT,
    uploaded_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CALL dhas_add_index('reports', 'idx_reports_user_id',     'user_id');
CALL dhas_add_index('reports', 'idx_reports_uploaded_at', 'uploaded_at');


-- ── Migration: rename file_name → filename if old column exists ──
DROP PROCEDURE IF EXISTS dhas_migrate_reports;
DELIMITER //
CREATE PROCEDURE dhas_migrate_reports()
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'reports' AND column_name = 'file_name'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'reports' AND column_name = 'filename'
    ) THEN
        ALTER TABLE reports CHANGE `file_name` `filename` VARCHAR(255) NOT NULL DEFAULT '';
        SELECT 'Migration done: file_name renamed to filename' AS result;
    ELSE
        SELECT 'OK: filename column already correct' AS result;
    END IF;
END //
DELIMITER ;
CALL dhas_migrate_reports();
DROP PROCEDURE IF EXISTS dhas_migrate_reports;


-- ── doctors ────────────────────────────────────────────────────
-- NOTE: is_verified defaults to 1 — all registered doctors are
--       immediately visible in the patient directory.
--       consultation_fee has been removed.
CREATE TABLE IF NOT EXISTS doctors (
    id               INT AUTO_INCREMENT PRIMARY KEY,
    name             VARCHAR(100)   NOT NULL,
    email            VARCHAR(100)   UNIQUE NOT NULL,
    password         VARCHAR(255)   NULL DEFAULT NULL ,
    google_id        VARCHAR(100)   NULL UNIQUE,
    invite_code      VARCHAR(20)    UNIQUE NOT NULL,

    -- Profile fields (filled after registration via Edit Profile)
    speciality       VARCHAR(100)   NULL DEFAULT 'General Physician',
    experience_years INT            NULL DEFAULT NULL,
    hospital         VARCHAR(200)   NULL DEFAULT NULL,
    city             VARCHAR(100)   NULL DEFAULT NULL,
    state            VARCHAR(100)   NULL DEFAULT NULL,
    languages        VARCHAR(300)   NULL DEFAULT NULL,
    bio              TEXT           NULL DEFAULT NULL,
    expertise        JSON           NULL DEFAULT NULL,
    profile_photo    MEDIUMTEXT     NULL DEFAULT NULL,

    -- Default 1: every new doctor is immediately verified / visible
    is_verified      TINYINT(1)     NOT NULL DEFAULT 0,

    created_at       TIMESTAMP      DEFAULT CURRENT_TIMESTAMP
);

-- ── doctor_patient_connections ──────────────────────────────────
CREATE TABLE IF NOT EXISTS doctor_patient_connections (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    doctor_id    INT NOT NULL,
    patient_id   INT NOT NULL,
    connected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_connection (doctor_id, patient_id),
    FOREIGN KEY (doctor_id)  REFERENCES doctors(id) ON DELETE CASCADE,
    FOREIGN KEY (patient_id) REFERENCES users(id)   ON DELETE CASCADE
);

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


-- ── Migration helpers for existing doctors table ────────────────
DROP PROCEDURE IF EXISTS dhas_migrate_doctors;
DELIMITER //
CREATE PROCEDURE dhas_migrate_doctors()
BEGIN
    -- Add missing profile columns if upgrading from v6
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'doctors' AND column_name = 'experience_years'
    ) THEN
        ALTER TABLE doctors
            ADD COLUMN experience_years INT            NULL DEFAULT NULL AFTER speciality,
            ADD COLUMN hospital         VARCHAR(200)   NULL DEFAULT NULL AFTER experience_years,
            ADD COLUMN city             VARCHAR(100)   NULL DEFAULT NULL AFTER hospital,
            ADD COLUMN state            VARCHAR(100)   NULL DEFAULT NULL AFTER city,
            ADD COLUMN languages        VARCHAR(300)   NULL DEFAULT NULL AFTER state,
            ADD COLUMN bio              TEXT           NULL DEFAULT NULL AFTER languages,
            ADD COLUMN expertise        JSON           NULL DEFAULT NULL AFTER bio,
            ADD COLUMN profile_photo    MEDIUMTEXT     NULL DEFAULT NULL AFTER expertise,
            ADD COLUMN is_verified      TINYINT(1)     NOT NULL DEFAULT 1 AFTER profile_photo;
        SELECT 'Added new doctor profile columns' AS result;
    END IF;

    -- Add google_id if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'doctors' AND column_name = 'google_id'
    ) THEN
        ALTER TABLE doctors ADD COLUMN google_id VARCHAR(100) NULL UNIQUE AFTER email;
        SELECT 'Added google_id to doctors' AS result;
    END IF;

    -- Add is_verified if missing; default 1 for auto-verify
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'doctors' AND column_name = 'is_verified'
    ) THEN
        ALTER TABLE doctors ADD COLUMN is_verified TINYINT(1) NOT NULL DEFAULT 1;
        SELECT 'Added is_verified to doctors (default 1 = auto-verified)' AS result;
    END IF;

    -- Change is_verified default to 1 on existing tables that had it as 0
    ALTER TABLE doctors MODIFY COLUMN is_verified TINYINT(1) NOT NULL DEFAULT 1;

    -- Auto-verify all existing doctors so none are invisible
    UPDATE doctors SET is_verified = 1 WHERE is_verified = 0;
    SELECT 'All existing doctors set to verified' AS result;

    -- Drop consultation_fee if it exists (removed in v8)
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'doctors' AND column_name = 'consultation_fee'
    ) THEN
        ALTER TABLE doctors DROP COLUMN consultation_fee;
        SELECT 'Dropped consultation_fee column' AS result;
    ELSE
        SELECT 'consultation_fee column already absent' AS result;
    END IF;
END //
DELIMITER ;
CALL dhas_migrate_doctors();
DROP PROCEDURE IF EXISTS dhas_migrate_doctors;

-- Indexes
CALL dhas_add_index('doctors', 'idx_doctors_invite_code',  'invite_code');
CALL dhas_add_index('doctors', 'idx_doctors_is_verified',  'is_verified');

-- Cleanup
DROP PROCEDURE IF EXISTS dhas_add_index;
-- ============================================================
-- DHAS Chat System — chat_schema.sql
-- Run this AFTER your existing schema.sql
-- ============================================================

USE dhas_db;

-- ── chat_rooms ──────────────────────────────────────────────────
-- One room per accepted doctor-patient pair.
-- Keyed by the connection row so deletion cascades automatically.
CREATE TABLE IF NOT EXISTS chat_rooms (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    connection_id  INT          NOT NULL UNIQUE,   -- FK → doctor_patient_connections
    doctor_id      INT          NOT NULL,
    patient_id     INT          NOT NULL,
    created_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (connection_id) REFERENCES doctor_patient_connections(id) ON DELETE CASCADE,
    FOREIGN KEY (doctor_id)     REFERENCES doctors(id)  ON DELETE CASCADE,
    FOREIGN KEY (patient_id)    REFERENCES users(id)    ON DELETE CASCADE
);

-- ── chat_messages ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_messages (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    room_id        INT          NOT NULL,
    sender_type    ENUM('doctor','patient') NOT NULL,
    sender_id      INT          NOT NULL,
    message_type   ENUM('text','image','pdf','symptom_share','report_share') NOT NULL DEFAULT 'text',
    content        TEXT         NULL,          -- plain text body
    file_name      VARCHAR(255) NULL,          -- original filename (attachments)
    file_size      VARCHAR(20)  NULL,
    file_mime      VARCHAR(80)  NULL,
    file_data      LONGTEXT     NULL,          -- base64 dataURL (same pattern as reports)
    metadata       JSON         NULL,          -- extra JSON for symptom/report payloads
    status         ENUM('sent','delivered','read') NOT NULL DEFAULT 'sent',
    created_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES chat_rooms(id) ON DELETE CASCADE
);

-- Indexes for fast room-based queries
DROP PROCEDURE IF EXISTS dhas_chat_add_index;
DELIMITER //
CREATE PROCEDURE dhas_chat_add_index(
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

CALL dhas_chat_add_index('chat_messages', 'idx_chat_msg_room_id',    'room_id');
CALL dhas_chat_add_index('chat_messages', 'idx_chat_msg_created_at', 'created_at');
CALL dhas_chat_add_index('chat_rooms',    'idx_chat_rooms_doctor',   'doctor_id');
CALL dhas_chat_add_index('chat_rooms',    'idx_chat_rooms_patient',  'patient_id');

DROP PROCEDURE IF EXISTS dhas_chat_add_index;

-- ── Migration: add status column to existing connections ─────────
-- (doctor_patient_connections may not have a status column in old DBs)
DROP PROCEDURE IF EXISTS dhas_chat_migrate;
DELIMITER //
CREATE PROCEDURE dhas_chat_migrate()
BEGIN
    -- Ensure connections table has status column (should already exist)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name   = 'doctor_patient_connections'
          AND column_name  = 'status'
    ) THEN
        ALTER TABLE doctor_patient_connections
            ADD COLUMN status       VARCHAR(20) NOT NULL DEFAULT 'accepted',
            ADD COLUMN requested_at TIMESTAMP   NULL,
            ADD COLUMN responded_at TIMESTAMP   NULL,
            ADD COLUMN connected_at TIMESTAMP   NULL DEFAULT CURRENT_TIMESTAMP;
    END IF;

    -- Auto-create chat rooms for all currently accepted connections
    INSERT IGNORE INTO chat_rooms (connection_id, doctor_id, patient_id)
    SELECT id, doctor_id, patient_id
    FROM doctor_patient_connections
    WHERE status = 'accepted';
END //
DELIMITER ;
CALL dhas_chat_migrate();
DROP PROCEDURE IF EXISTS dhas_chat_migrate;

-- ============================================================
-- NOTES:
--   • file_data stores base64 (same approach as your reports table)
--   • metadata JSON stores:
--       symptom_share → { symptoms:[], condition_name, severity, checked_at }
--       report_share  → { report_id, filename, filetype }
--   • status progression: sent → delivered (other side connects) → read
--   • chat_rooms are created automatically when a connection is accepted
--   • Deleting the connection cascades and deletes the room + all messages
-- ============================================================

-- ============================================================
-- NOTES (v8):
--   • Every doctor is auto-verified on registration (is_verified=1).
--   • To hide a specific doctor: UPDATE doctors SET is_verified=0 WHERE id=X;
--   • consultation_fee has been removed from the schema entirely.
-- ============================================================