const db = require("../config/db");

// Create users table if not exists
const createUserTable = () => {
    const sql = `
        CREATE TABLE IF NOT EXISTS users (
            id         INT AUTO_INCREMENT PRIMARY KEY,
            name       VARCHAR(100)        NOT NULL,
            email      VARCHAR(100) UNIQUE NOT NULL,
            password   VARCHAR(100)        NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `;
    db.query(sql, (err) => {
        if (err) console.error("❌ User table error:", err.message);
        else     console.log("✅ Users table ready.");
    });
};

module.exports = { createUserTable };