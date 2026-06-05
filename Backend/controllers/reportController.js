// ── reportController.js (FIXED v3) ───────────────────────────
// ROOT CAUSE FIX:
//   The database column is `file_name` (with underscore).
//   schema.sql migration was never executed, so `filename` column
//   does not exist. This version uses `file_name` everywhere to
//   match the actual existing DB schema.
//
// ERROR THAT WAS HAPPENING:
//   Unknown column 'filename' in 'field list' (ER_BAD_FIELD_ERROR)
//
// FILES CHANGED: reportController.js, report.js (frontend)
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

    const maxBase64Bytes = 10 * 1024 * 1024; // 10 MB
    if (dataurl.length > maxBase64Bytes) {
        return res.json({
            success: false,
            message: "File is too large. Maximum size is approximately 7 MB."
        });
    }

    // Use `file_name` column name to match existing DB schema
    db.query(
        `INSERT INTO reports (user_id, file_name, filesize, filetype, dataurl, uploaded_at)
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
                        message: "File too large for database. Please try a smaller file (under 4 MB)."
                    });
                }
                // If file_name column also missing, give a clear message
                if (err.code === "ER_BAD_FIELD_ERROR") {
                    return res.json({
                        success: false,
                        message: "Database column error. Please run schema.sql to fix the reports table."
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

    // Use `file_name` column name to match existing DB schema
    db.query(
        `SELECT id, file_name AS filename, filesize, filetype, uploaded_at
         FROM reports WHERE user_id = ? ORDER BY uploaded_at DESC`,
        [requestedId],
        (err, result) => {
            if (err) {
                console.error("getReports DB error:", err.message);
                // Check if the column name issue - try alternate column name
                if (err.code === "ER_BAD_FIELD_ERROR") {
                    // Try with `filename` (no underscore) as fallback
                    db.query(
                        `SELECT id, filename, filesize, filetype, uploaded_at
                         FROM reports WHERE user_id = ? ORDER BY uploaded_at DESC`,
                        [requestedId],
                        (err2, result2) => {
                            if (err2) {
                                console.error("getReports fallback DB error:", err2.message);
                                return res.json({ success: false, message: "Failed to load reports. Please run schema.sql to fix the database." });
                            }
                            res.json({ success: true, data: result2 });
                        }
                    );
                    return;
                }
                return res.json({ success: false, message: "Failed to load reports." });
            }
            res.json({ success: true, data: result });
        }
    );
};

/* ── VIEW ────────────────────────────────────────────────────── */
const viewReport = (req, res) => {
    const { id } = req.params;

    // Use `file_name` column name to match existing DB schema
    db.query(
        `SELECT id, user_id, file_name AS filename, filetype, dataurl FROM reports WHERE id = ?`,
        [id],
        (err, rows) => {
            if (err) {
                console.error("viewReport DB error:", err.message);
                // Fallback to `filename` column
                if (err.code === "ER_BAD_FIELD_ERROR") {
                    db.query(
                        `SELECT id, user_id, filename, filetype, dataurl FROM reports WHERE id = ?`,
                        [id],
                        (err2, rows2) => {
                            if (err2 || rows2.length === 0) {
                                return res.status(404).json({ success: false, message: "Report not found." });
                            }
                            const r = rows2[0];
                            if (!isSelf(req, r.user_id)) {
                                return res.status(403).json({ success: false, message: "Access denied." });
                            }
                            res.json({ success: true, filename: r.filename, filetype: r.filetype, dataurl: r.dataurl });
                        }
                    );
                    return;
                }
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