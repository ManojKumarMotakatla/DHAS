-- ============================================================
-- DHAS — dhas_schema_complete.sql  (Final Consolidated)
--
-- Includes:
--   v8 base schema       (schema.sql)
--   Chat system          (chat_schema.sql)
--   Connection migration (doctor_patient_connections status cols)
--   E2EE support         (e2ee_schema.sql + chat_schema_fix.sql)
--
-- Safe to run on a fresh DB or an existing DB — every ALTER
-- is guarded inside migration procedures.
-- ============================================================

CREATE DATABASE IF NOT EXISTS dhas_db;
USE dhas_db;


-- ════════════════════════════════════════════════════════════
-- SECTION 1 — CORE TABLES
-- ════════════════════════════════════════════════════════════

-- ── users ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    name       VARCHAR(100)        NOT NULL,
    email      VARCHAR(100) UNIQUE NOT NULL,
    password   VARCHAR(255)        NULL DEFAULT NULL,
    provider   VARCHAR(20)         NOT NULL DEFAULT 'local',
    google_id  VARCHAR(100)        NULL UNIQUE,
    public_key TEXT                NULL DEFAULT NULL,   -- ECDH public key (JWK)
    created_at TIMESTAMP           DEFAULT CURRENT_TIMESTAMP
);


-- ── user_profiles ─────────────────────────────────────────────
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


-- ── symptoms ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS symptoms (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    user_id        INT         NOT NULL,
    symptoms       JSON        NOT NULL,
    condition_name VARCHAR(100),
    severity       VARCHAR(20),
    created_at     TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);


-- ── reminders ─────────────────────────────────────────────────
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


-- ── reminder_logs ─────────────────────────────────────────────
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


-- ── reports ───────────────────────────────────────────────────
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


-- ── doctors ───────────────────────────────────────────────────
-- is_verified DEFAULT 0  — set to 1 manually or via admin.
-- To auto-verify on register change DEFAULT to 1.
-- consultation_fee removed in v8.
CREATE TABLE IF NOT EXISTS doctors (
    id               INT AUTO_INCREMENT PRIMARY KEY,
    name             VARCHAR(100)   NOT NULL,
    email            VARCHAR(100)   UNIQUE NOT NULL,
    password         VARCHAR(255)   NULL DEFAULT NULL,
    google_id        VARCHAR(100)   NULL UNIQUE,
    public_key       TEXT           NULL DEFAULT NULL,   -- ECDH public key (JWK)
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

    -- 0 = unverified (default). Set to 1 to make doctor visible to patients.
    is_verified      TINYINT(1)     NOT NULL DEFAULT 0,

    created_at       TIMESTAMP      DEFAULT CURRENT_TIMESTAMP
);


-- ── doctor_patient_connections ────────────────────────────────
CREATE TABLE IF NOT EXISTS doctor_patient_connections (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    doctor_id    INT          NOT NULL,
    patient_id   INT          NOT NULL,
    status       ENUM('pending','accepted','rejected') NOT NULL DEFAULT 'pending',
    requested_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    responded_at TIMESTAMP    NULL DEFAULT NULL,
    connected_at TIMESTAMP    NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_connection (doctor_id, patient_id),
    FOREIGN KEY (doctor_id)  REFERENCES doctors(id) ON DELETE CASCADE,
    FOREIGN KEY (patient_id) REFERENCES users(id)   ON DELETE CASCADE
);


-- ── password_reset_tokens ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    user_id    INT          NOT NULL,
    token      VARCHAR(64)  NOT NULL UNIQUE,
    expires_at DATETIME     NOT NULL,
    used       TINYINT(1)   NOT NULL DEFAULT 0,
    created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);


-- ════════════════════════════════════════════════════════════
-- SECTION 2 — CHAT TABLES
-- ════════════════════════════════════════════════════════════

-- ── chat_rooms ────────────────────────────────────────────────
-- One room per accepted doctor-patient connection.
-- Deletion of connection cascades to room and all messages.
CREATE TABLE IF NOT EXISTS chat_rooms (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    connection_id  INT          NOT NULL UNIQUE,
    doctor_id      INT          NOT NULL,
    patient_id     INT          NOT NULL,
    created_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (connection_id) REFERENCES doctor_patient_connections(id) ON DELETE CASCADE,
    FOREIGN KEY (doctor_id)     REFERENCES doctors(id) ON DELETE CASCADE,
    FOREIGN KEY (patient_id)    REFERENCES users(id)   ON DELETE CASCADE
);


-- ── chat_messages ─────────────────────────────────────────────
-- content / file_data hold base64 ciphertext when is_encrypted=1.
-- iv / file_iv are the AES-GCM nonces (base64, 12 bytes) for
-- text and file payloads respectively.
CREATE TABLE IF NOT EXISTS chat_messages (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    room_id        INT          NOT NULL,
    sender_type    ENUM('doctor','patient') NOT NULL,
    sender_id      INT          NOT NULL,
    message_type   ENUM('text','image','pdf','symptom_share','report_share') NOT NULL DEFAULT 'text',
    content        TEXT         NULL,          -- plaintext or AES-GCM ciphertext (base64)
    file_name      VARCHAR(255) NULL,
    file_size      VARCHAR(20)  NULL,
    file_mime      VARCHAR(80)  NULL,
    file_data      LONGTEXT     NULL,          -- base64 dataURL or AES-GCM ciphertext
    metadata       JSON         NULL,          -- extra payload for symptom/report shares
    is_encrypted   TINYINT(1)   NOT NULL DEFAULT 0,
    iv             VARCHAR(64)  NULL DEFAULT NULL,   -- nonce for content
    file_iv        VARCHAR(64)  NULL DEFAULT NULL,   -- nonce for file_data
    status         ENUM('sent','delivered','read') NOT NULL DEFAULT 'sent',
    created_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES chat_rooms(id) ON DELETE CASCADE
);


-- ════════════════════════════════════════════════════════════
-- SECTION 3 — INDEXES
-- ════════════════════════════════════════════════════════════

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

-- symptoms
CALL dhas_add_index('symptoms',               'idx_symptoms_user_id',        'user_id');
CALL dhas_add_index('symptoms',               'idx_symptoms_created_at',     'created_at');
-- reminders
CALL dhas_add_index('reminders',              'idx_reminders_user_id',       'user_id');
CALL dhas_add_index('reminders',              'idx_reminders_start_date',    'start_date');
-- reminder_logs
CALL dhas_add_index('reminder_logs',          'idx_logs_reminder_id',        'reminder_id');
CALL dhas_add_index('reminder_logs',          'idx_logs_user_id',            'user_id');
CALL dhas_add_index('reminder_logs',          'idx_logs_scheduled_time',     'scheduled_time');
-- reports
CALL dhas_add_index('reports',                'idx_reports_user_id',         'user_id');
CALL dhas_add_index('reports',                'idx_reports_uploaded_at',     'uploaded_at');
-- doctors
CALL dhas_add_index('doctors',                'idx_doctors_invite_code',     'invite_code');
CALL dhas_add_index('doctors',                'idx_doctors_is_verified',     'is_verified');
-- password_reset_tokens
CALL dhas_add_index('password_reset_tokens',  'idx_prt_token',               'token');
CALL dhas_add_index('password_reset_tokens',  'idx_prt_user_id',             'user_id');
-- chat
CALL dhas_add_index('chat_messages',          'idx_chat_msg_room_id',        'room_id');
CALL dhas_add_index('chat_messages',          'idx_chat_msg_created_at',     'created_at');
CALL dhas_add_index('chat_rooms',             'idx_chat_rooms_doctor',       'doctor_id');
CALL dhas_add_index('chat_rooms',             'idx_chat_rooms_patient',      'patient_id');

DROP PROCEDURE IF EXISTS dhas_add_index;


-- ════════════════════════════════════════════════════════════
-- SECTION 4 — MIGRATION (safe for existing databases)
-- ════════════════════════════════════════════════════════════

DROP PROCEDURE IF EXISTS dhas_full_migrate;
DELIMITER //
CREATE PROCEDURE dhas_full_migrate()
BEGIN

    -- ── reports: rename file_name → filename if old column exists ──
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'reports' AND column_name = 'file_name'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'reports' AND column_name = 'filename'
    ) THEN
        ALTER TABLE reports CHANGE `file_name` `filename` VARCHAR(255) NOT NULL DEFAULT '';
        SELECT 'Migration: file_name renamed to filename' AS result;
    END IF;

    -- ── doctors: add profile columns if upgrading from v6 ──
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
            ADD COLUMN profile_photo    MEDIUMTEXT     NULL DEFAULT NULL AFTER expertise;
        SELECT 'Migration: added doctor profile columns' AS result;
    END IF;

    -- ── doctors: add google_id if missing ──
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'doctors' AND column_name = 'google_id'
    ) THEN
        ALTER TABLE doctors ADD COLUMN google_id VARCHAR(100) NULL UNIQUE AFTER email;
        SELECT 'Migration: added google_id to doctors' AS result;
    END IF;

    -- ── doctors: add is_verified if missing ──
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'doctors' AND column_name = 'is_verified'
    ) THEN
        ALTER TABLE doctors ADD COLUMN is_verified TINYINT(1) NOT NULL DEFAULT 0;
        SELECT 'Migration: added is_verified to doctors' AS result;
    END IF;

    -- ── doctors: ensure password is nullable ──
    ALTER TABLE doctors MODIFY COLUMN password VARCHAR(255) NULL;

    -- ── doctors: drop consultation_fee if exists (removed in v8) ──
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'doctors' AND column_name = 'consultation_fee'
    ) THEN
        ALTER TABLE doctors DROP COLUMN consultation_fee;
        SELECT 'Migration: dropped consultation_fee' AS result;
    END IF;

    -- ── doctor_patient_connections: add status columns if missing ──
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'doctor_patient_connections' AND column_name = 'status'
    ) THEN
        ALTER TABLE doctor_patient_connections
            ADD COLUMN status        ENUM('pending','accepted','rejected') NOT NULL DEFAULT 'pending' AFTER patient_id,
            ADD COLUMN requested_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP AFTER status,
            ADD COLUMN responded_at  TIMESTAMP    NULL DEFAULT NULL AFTER requested_at,
            ADD COLUMN connected_at  TIMESTAMP    NULL DEFAULT CURRENT_TIMESTAMP AFTER responded_at;
        -- Mark legacy rows as accepted for backward compatibility
        UPDATE doctor_patient_connections SET status = 'accepted' WHERE status = 'pending';
        SELECT 'Migration: added status cols to doctor_patient_connections' AS result;
    END IF;

    -- ── chat_rooms: auto-create for all accepted connections ──
    INSERT IGNORE INTO chat_rooms (connection_id, doctor_id, patient_id)
    SELECT id, doctor_id, patient_id
    FROM doctor_patient_connections
    WHERE status = 'accepted';

    -- ── users.public_key ──
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'public_key'
    ) THEN
        ALTER TABLE users ADD COLUMN public_key TEXT NULL DEFAULT NULL AFTER google_id;
        SELECT 'Migration: added users.public_key' AS result;
    END IF;

    -- ── doctors.public_key ──
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'doctors' AND column_name = 'public_key'
    ) THEN
        ALTER TABLE doctors ADD COLUMN public_key TEXT NULL DEFAULT NULL AFTER google_id;
        SELECT 'Migration: added doctors.public_key' AS result;
    END IF;

    -- ── chat_messages.is_encrypted ──
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'chat_messages' AND column_name = 'is_encrypted'
    ) THEN
        ALTER TABLE chat_messages ADD COLUMN is_encrypted TINYINT(1) NOT NULL DEFAULT 0 AFTER metadata;
        SELECT 'Migration: added chat_messages.is_encrypted' AS result;
    END IF;

    -- ── chat_messages.iv ──
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'chat_messages' AND column_name = 'iv'
    ) THEN
        ALTER TABLE chat_messages ADD COLUMN iv VARCHAR(64) NULL DEFAULT NULL AFTER is_encrypted;
        SELECT 'Migration: added chat_messages.iv' AS result;
    END IF;

    -- ── chat_messages.file_iv ──
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'chat_messages' AND column_name = 'file_iv'
    ) THEN
        ALTER TABLE chat_messages ADD COLUMN file_iv VARCHAR(64) NULL DEFAULT NULL AFTER iv;
        SELECT 'Migration: added chat_messages.file_iv' AS result;
    END IF;

END //
DELIMITER ;
CALL dhas_full_migrate();
DROP PROCEDURE IF EXISTS dhas_full_migrate;


-- ════════════════════════════════════════════════════════════
-- QUICK REFERENCE
-- ════════════════════════════════════════════════════════════
--
-- Tables
-- ──────
--   users                        Patient accounts
--   user_profiles                Extended patient profile data
--   symptoms                     AI symptom check results
--   reminders                    Medicine reminders
--   reminder_logs                Per-dose taken/missed/snoozed log
--   reports                      Uploaded medical report files
--   doctors                      Doctor accounts
--   doctor_patient_connections   Connection requests (pending → accepted/rejected)
--   password_reset_tokens        One-time password reset links
--   chat_rooms                   One room per accepted connection
--   chat_messages                Messages (text, image, pdf, symptom/report share)
--
-- E2EE notes
-- ──────────
--   users.public_key / doctors.public_key
--       ECDH P-256 public key in JWK format. Private key NEVER stored.
--   chat_messages.is_encrypted
--       1 = content & file_data are AES-256-GCM ciphertext (base64).
--   chat_messages.iv
--       AES-GCM nonce (base64, 12 bytes) for decrypting `content`.
--   chat_messages.file_iv
--       AES-GCM nonce (base64, 12 bytes) for decrypting `file_data`.
--
-- Doctor visibility
-- ─────────────────
--   is_verified = 0  →  hidden from patient directory (default).
--   is_verified = 1  →  visible.
--   To auto-verify on registration, set DEFAULT 1 in app logic
--   or change the column default above.
--
-- ============================================================