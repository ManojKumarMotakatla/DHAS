const db = require("../config/db");

const createReminderTable = () => {
    const sql = `
        CREATE TABLE IF NOT EXISTS reminders (
            id         INT AUTO_INCREMENT PRIMARY KEY,
            user_id    INT          NOT NULL,
            medicine   VARCHAR(150) NOT NULL,
            time       VARCHAR(10)  NOT NULL,
            frequency  VARCHAR(50)  DEFAULT 'Once daily',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `;
    db.query(sql, (err) => {
        if (err) console.error("❌ Reminders table error:", err.message);
        else     console.log("✅ Reminders table ready.");
    });
};

module.exports = { createReminderTable };