const db = require("../config/db");

const createReportTable = () => {
    const sql = `
        CREATE TABLE IF NOT EXISTS reports (
            id          INT AUTO_INCREMENT PRIMARY KEY,
            user_id     INT          NOT NULL,
            filename    VARCHAR(255) NOT NULL,
            filesize    VARCHAR(20),
            uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `;
    db.query(sql, (err) => {
        if (err) console.error("❌ Reports table error:", err.message);
        else     console.log("✅ Reports table ready.");
    });
};

module.exports = { createReportTable };