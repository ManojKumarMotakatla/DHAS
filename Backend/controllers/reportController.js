
// ── reportController.js ──────────────────────────────────────
// Stores files as base64 in the `dataurl` column (matches schema.sql).
// No file system needed. No `file_path` column needed.
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
    const estimatedBytes = (dataurl.length * 3) / 4;
    if (estimatedBytes > 5 * 1024 * 1024) {
        return res.json({ success: false, message: "File exceeds 4 MB limit." });
    }

    db.query(
        `INSERT INTO reports (user_id, file_name, filesize, filetype, dataurl, uploaded_at)
         VALUES (?, ?, ?, ?, ?, NOW())`,
        [user_id, String(filename).trim(), filesize || "", filetype || "", dataurl],
        (err) => {
            if (err) {
                console.error("uploadReport DB error:", err.message);
                return res.json({ success: false, message: "Failed to save report. Please try again." });
            }
            res.json({ success: true, message: "Report uploaded successfully." });
        }
    );
};

/* ── GET LIST ────────────────────────────────────────────────── */
const getReports = (req, res) => {
    const requestedId = parseInt(req.params.user_id);

    if (!isSelf(req, requestedId)) {
        return res.status(403).json({ success: false, message: "Access denied." });
    }

    db.query(
        `SELECT id, file_name AS filename, filesize, filetype, uploaded_at
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
        `SELECT id, user_id, file_name, filetype, dataurl FROM reports WHERE id = ?`,
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
                filename: r.file_name,
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
