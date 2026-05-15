-- ============================================================
-- DHAS — schema.sql
-- Safe to run on BOTH fresh and existing databases.
-- Every structural change uses IF NOT EXISTS / MODIFY safely.
-- ============================================================


-- ── users ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    name       VARCHAR(100)        NOT NULL,
    email      VARCHAR(100) UNIQUE NOT NULL,
    password   VARCHAR(255)        NULL DEFAULT NULL,
    provider   VARCHAR(20)         NOT NULL DEFAULT 'local',
    google_id  VARCHAR(100)        NULL UNIQUE,
    created_at TIMESTAMP           DEFAULT CURRENT_TIMESTAMP
);

-- ── user_profiles ──────────────────────────────────────────
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

-- ── symptoms ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS symptoms (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    user_id        INT         NOT NULL,
    symptoms       TEXT        NOT NULL,
    condition_name VARCHAR(100),
    severity       VARCHAR(20),
    created_at     TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ── reminders ──────────────────────────────────────────────
-- Column name: medicine_name  (NOT 'medicine')
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

-- ── reports ────────────────────────────────────────────────
-- Column name: file_name  (NOT 'filename')
CREATE TABLE IF NOT EXISTS reports (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    user_id     INT          NOT NULL,
    file_name   VARCHAR(255) NOT NULL,
    filesize    VARCHAR(20),
    filetype    VARCHAR(50),
    dataurl     LONGTEXT,
    uploaded_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

