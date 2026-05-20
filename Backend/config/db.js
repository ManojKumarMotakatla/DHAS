const mysql = require("mysql2");

const pool = mysql.createPool({
  host:     "localhost",
  user:     "root",         // ← change to your MySQL username
  password: "VYSHUNANI",             // ← change to your MySQL password
  database: "dhas_db",
  port:     3306,
  waitForConnections:       true,
  connectionLimit:          10,
  queueLimit:               0,
  enableKeepAlive:          true,
  keepAliveInitialDelay:    30000
});

// Test connection on startup
pool.getConnection((err, connection) => {
  if (err) {
    console.error("❌ Database connection failed:", err.message);
  } else {
    console.log("✅ Connected to local MySQL database (dhas_db)");
    connection.release();
  }
});

module.exports = pool;