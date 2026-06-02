// ── reportController.js — user_id from req.userId; ownership checks ──
const db = require("../config/db");
const { isSelf } = require("../middleware/authMiddleware");

let _cols = null;
function getReportCols(callback) {
    if (_cols) return callback(null, _cols);
    db.query("DESCRIBE reports", (err, rows) => {
        if (err) return callback(err);
        const names = rows.map(r => r.Field);
        _cols = {
            nameCol:     names.includes("file_name")   ? "file_name"   : "filename",
            uploadedCol: names.includes("uploaded_at") ? "uploaded_at" : "created_at"
        };
        callback(null, _cols);
    });
}

/* ── UPLOAD ─────────────────────────────────────────────────── */
const uploadReport = (req, res) => {
    const user_id = req.userId;
    const { filename, filesize, filetype, dataurl } = req.body;

    if (!filename || !dataurl) {
        return res.json({ success: false, message: !filename ? "Filename missing." : "File data missing." });
    }
    if (!String(dataurl).startsWith("data:")) {
        return res.json({ success: false, message: "Invalid file data." });
    }

    getReportCols((err, cols) => {
        if (err) return res.json({ success: false, message: "DB error." });

        db.query(
            `INSERT INTO reports (user_id, ${cols.nameCol}, filesize, filetype, dataurl) VALUES (?, ?, ?, ?, ?)`,
            [user_id, filename, filesize || "", filetype || "", dataurl],
            (err2) => {
                if (err2) {
                    console.error("uploadReport DB error:", err2);
                    return res.json({ success: false, message: "Failed to upload." });
                }
                res.json({ success: true, message: "Report uploaded." });
            }
        );
    });
};

/* ── GET LIST ────────────────────────────────────────────────── */
const getReports = (req, res) => {
    const requestedId = parseInt(req.params.user_id);

    if (!isSelf(req, requestedId)) {
        return res.status(403).json({ success: false, message: "Access denied." });
    }

    getReportCols((err, cols) => {
        if (err) return res.json({ success: false });

        db.query(
            `SELECT id, ${cols.nameCol}, filesize, filetype, ${cols.uploadedCol} FROM reports WHERE user_id = ? ORDER BY ${cols.uploadedCol} DESC`,
            [requestedId],
            (err2, result) => {
                if (err2) return res.json({ success: false });
                const data = result.map(r => ({
                    ...r,
                    filename:    r[cols.nameCol],
                    uploaded_at: r[cols.uploadedCol]
                }));
                res.json({ success: true, data });
            }
        );
    });
};

/* ── VIEW (single report with dataurl) ───────────────────────── */
const viewReport = (req, res) => {
    const { id } = req.params;

    getReportCols((err, cols) => {
        if (err) return res.status(500).json({ success: false, message: "DB error." });

        db.query(
            `SELECT id, user_id, ${cols.nameCol} AS filename, filetype, dataurl FROM reports WHERE id = ?`,
            [id],
            (err2, rows) => {
                if (err2) {
                    console.error("viewReport DB error:", err2);
                    return res.status(500).json({ success: false, message: "DB error." });
                }

                if (rows.length === 0) {
                    return res.status(404).json({ success: false, message: "Report not found." });
                }

                const r = rows[0];

                // Ownership check
                if (!isSelf(req, r.user_id)) {
                    return res.status(403).json({ success: false, message: "Access denied." });
                }

                if (!r.dataurl) {
                    return res.json({ success: false, message: "File data is missing or corrupted." });
                }

                res.json({
                    success:  true,
                    filename: r.filename,
                    filetype: r.filetype,
                    dataurl:  r.dataurl
                });
            }
        );
    });
};

/* ── DELETE ─────────────────────────────────────────────────── */
const deleteReport = async (req, res) => {
    const { id } = req.params;

    try {
        const [rows] = await db.promise().query(
            "SELECT user_id FROM reports WHERE id = ?", [id]
        );

        if (rows.length === 0) return res.json({ success: false, message: "Report not found." });

        if (!isSelf(req, rows[0].user_id)) {
            return res.status(403).json({ success: false, message: "Access denied." });
        }

        db.query("DELETE FROM reports WHERE id = ?", [id], (err) => {
            if (err) return res.json({ success: false });
            res.json({ success: true, message: "Report deleted." });
        });
    } catch (err) {
        console.error("deleteReport error:", err);
        return res.status(500).json({ success: false });
    }
};

module.exports = { uploadReport, getReports, viewReport, deleteReport };