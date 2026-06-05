// ── reportController.js (FIXED v2) ───────────────────────────
// FIXES:
//   1. Removed SET SESSION max_allowed_packet — read-only in MySQL 8+
//      (was causing the upload to never call the INSERT query)
//   2. Switched back to direct db.query() — no getConnection() needed
//      since the pool handles packet size via the express body limit.
//   3. Uses `filename` (no underscore) matching schema.sql column name.
// ─────────────────────────────────────────────────────────────
const db = require("../config/db");
const { isSelf } = require("../middleware/authMiddleware");

/* ── UPLOAD ─────────────────────────────────────────────────── */
const uploadReport = (req, res) => {
    const user_id = req.userId;
    const { filename, filesize, filetype, dataurl } = req.body;

    if (!filename || !String(filename).trim()) {
        return res.json({ success: false, message: "Filename missing." });
    }
    if (!dataurl || !String(dataurl).startsWith("data:")) {
        return res.json({ success: false, message: "Invalid file data." });
    }

    // Rough size check — base64 is ~33% larger than binary
    // Allow up to 10 MB base64 string (≈7.5 MB file)
    const maxBase64Bytes = 10 * 1024 * 1024; // 10 MB
    if (dataurl.length > maxBase64Bytes) {
        return res.json({
            success: false,
            message: "File is too large. Maximum size is approximately 7 MB."
        });
    }

    // Direct insert — no SESSION SET needed.
    // Large packet support is handled by the express body-parser limit (12mb in server.js).
    db.query(
        `INSERT INTO reports (user_id, filename, filesize, filetype, dataurl, uploaded_at)
         VALUES (?, ?, ?, ?, ?, NOW())`,
        [user_id, String(filename).trim(), filesize || "", filetype || "", dataurl],
        (err) => {
            if (err) {
                console.error("uploadReport DB error:", err.message, "| Code:", err.code);
                if (
                    err.code === "ER_NET_PACKET_TOO_LARGE" ||
                    err.message.includes("too large") ||
                    err.message.includes("max_allowed_packet")
                ) {
                    return res.json({
                        success: false,
                        message: "File too large for database. Please try a smaller file (under 4 MB). Your MySQL server may need `max_allowed_packet` increased globally."
                    });
                }
                return res.json({ success: false, message: "Failed to save report. Please try again." });
            }
            res.json({ success: true, message: "Report uploaded successfully." });
        }
    );
};

/* ── GET LIST ────────────────────────────────────────────────── */
const getReports = (req, res) => {
    const requestedId = parseInt(req.params.user_id);

    if (!requestedId || isNaN(requestedId)) {
        return res.status(400).json({ success: false, message: "Invalid user ID." });
    }

    if (!isSelf(req, requestedId)) {
        return res.status(403).json({ success: false, message: "Access denied." });
    }

    db.query(
        `SELECT id, filename, filesize, filetype, uploaded_at
         FROM reports WHERE user_id = ? ORDER BY uploaded_at DESC`,
        [requestedId],
        (err, result) => {
            if (err) {
                console.error("getReports DB error:", err.message);
                return res.json({ success: false, message: "Failed to load reports." });
            }
            res.json({ success: true, data: result });
        }
    );
};

/* ── VIEW ────────────────────────────────────────────────────── */
const viewReport = (req, res) => {
    const { id } = req.params;

    db.query(
        `SELECT id, user_id, filename, filetype, dataurl FROM reports WHERE id = ?`,
        [id],
        (err, rows) => {
            if (err) {
                console.error("viewReport DB error:", err.message);
                return res.status(500).json({ success: false, message: "Failed to load report." });
            }
            if (rows.length === 0) {
                return res.status(404).json({ success: false, message: "Report not found." });
            }

            const r = rows[0];
            if (!isSelf(req, r.user_id)) {
                return res.status(403).json({ success: false, message: "Access denied." });
            }

            res.json({
                success:  true,
                filename: r.filename,
                filetype: r.filetype,
                dataurl:  r.dataurl
            });
        }
    );
};

/* ── DELETE ─────────────────────────────────────────────────── */
const deleteReport = async (req, res) => {
    const { id } = req.params;

    try {
        const [rows] = await db.promise().query(
            "SELECT user_id FROM reports WHERE id = ?", [id]
        );

        if (rows.length === 0) {
            return res.json({ success: false, message: "Report not found." });
        }
        if (!isSelf(req, rows[0].user_id)) {
            return res.status(403).json({ success: false, message: "Access denied." });
        }

        db.query("DELETE FROM reports WHERE id = ?", [id], (err) => {
            if (err) {
                console.error("deleteReport DB error:", err.message);
                return res.json({ success: false, message: "Failed to delete report." });
            }
            res.json({ success: true, message: "Report deleted." });
        });

    } catch (err) {
        console.error("deleteReport error:", err.message);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

module.exports = { uploadReport, getReports, viewReport, deleteReport };