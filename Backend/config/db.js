// ── CHANGED: reads from process.env instead of hardcoded values ──
// ── FIXED: Added maxPacketSize for large report uploads (base64 PDFs/images) ──
const mysql = require("mysql2");

const pool = mysql.createPool({
  host:     process.env.DB_HOST     || "localhost",
  user:     process.env.DB_USER     || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME     || "dhas_db",
  port:     parseInt(process.env.DB_PORT || "3306"),
  waitForConnections:    true,
  connectionLimit:       10,
  queueLimit:            0,
  enableKeepAlive:       true,
  keepAliveInitialDelay: 30000,
  // FIX: Allow large packets for base64-encoded file uploads.
  // A 4 MB file becomes ~5.3 MB in base64. 64 MB gives plenty of headroom.
  maxAllowedPacket: 67108864  // 64 MB
});

pool.getConnection((err, connection) => {
  if (err) {
    console.error("❌ Database connection failed:", err.message);
  } else {
    console.log("✅ Connected to MySQL database (" + process.env.DB_NAME + ")");
    // FIX: Set max_allowed_packet on the server side too, so MySQL accepts large inserts
    connection.query("SET SESSION max_allowed_packet = 67108864", (setErr) => {
      if (setErr) {
        console.warn("⚠️  Could not set max_allowed_packet:", setErr.message);
      }
      connection.release();
    });
  }
});

// FIX: Also set max_allowed_packet for every new connection from the pool
pool.on('connection', (connection) => {
  connection.query("SET SESSION max_allowed_packet = 67108864", (err) => {
    if (err) console.warn("Pool connection max_allowed_packet warning:", err.message);
  });
});

module.exports = pool;