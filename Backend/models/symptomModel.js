const db = require("../config/db");

const createSymptomTable = () => {
    const sql = `
        CREATE TABLE IF NOT EXISTS symptoms (
            id             INT AUTO_INCREMENT PRIMARY KEY,
            user_id        INT         NOT NULL,
            symptoms       TEXT        NOT NULL,
            condition_name VARCHAR(100),
            severity       VARCHAR(20),
            created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `;
    db.query(sql, (err) => {
        if (err) console.error("❌ Symptoms table error:", err.message);
        else     console.log("✅ Symptoms table ready.");
    });
};

module.exports = { createSymptomTable };