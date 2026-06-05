// ── reportController.js ──────────────────────────────────────
// FIX: Files are now saved to disk (/uploads/reports/) instead of
// storing base64 in the database. DB stores only the file path.
// ─────────────────────────────────────────────────────────────
const db      = require("../config/db");
const { isSelf } = require("../middleware/authMiddleware");
const fs      = require("fs");
const path    = require("path");

// Directory where report files are stored on disk
const UPLOADS_DIR = path.join(__dirname, "../../uploads/reports");

// Ensure the directory exists on startup
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

/* ── UPLOAD ─────────────────────────────────────────────────── */
const uploadReport = (req, res) => {
    const user_id = req.userId;
    const { filename, filesize, filetype, dataurl } = req.body;

    if (!filename) return res.json({ success: false, message: "Filename missing." });
    if (!dataurl || !String(dataurl).startsWith("data:")) {
        return res.json({ success: false, message: "Invalid file data." });
    }

    // Decode base64 → Buffer
    const matches = dataurl.match(/^data:([A-Za-z0-9+/\-]+);base64,(.+)$/);
    if (!matches) return res.json({ success: false, message: "Malformed data URL." });

    const buffer = Buffer.from(matches[2], "base64");

    // Enforce 4 MB limit server-side as well
    if (buffer.length > 4 * 1024 * 1024) {
        return res.json({ success: false, message: "File exceeds 4 MB limit." });
    }

    // Build a safe unique filename:  <userId>_<timestamp>_<originalname>
    const safeOriginal = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, "_");
    const storedName   = `${user_id}_${Date.now()}_${safeOriginal}`;
    const filePath     = path.join(UPLOADS_DIR, storedName);
    const dbPath       = `/uploads/reports/${storedName}`;  // URL served by express.static

    try {
        fs.writeFileSync(filePath, buffer);
    } catch (err) {
        console.error("uploadReport write error:", err.message);
        return res.json({ success: false, message: "Failed to save file to server." });
    }

    db.query(
        `INSERT INTO reports (user_id, file_name, filesize, filetype, file_path, uploaded_at)
         VALUES (?, ?, ?, ?, ?, NOW())`,
        [user_id, filename, filesize || "", filetype || "", dbPath],
        (err2) => {
            if (err2) {
                // Clean up orphaned file
                try { fs.unlinkSync(filePath); } catch (_) {}
                console.error("uploadReport DB error:", err2.message);
                return res.json({ success: false, message: "Failed to record upload." });
            }
            res.json({ success: true, message: "Report uploaded." });
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
        `SELECT id, file_name AS filename, filesize, filetype, file_path, uploaded_at
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

/* ── VIEW (serves a single report) ──────────────────────────── */
const viewReport = (req, res) => {
    const { id } = req.params;

    db.query(
        `SELECT id, user_id, file_name, filetype, file_path FROM reports WHERE id = ?`,
        [id],
        (err, rows) => {
            if (err) {
                console.error("viewReport DB error:", err.message);
                return res.status(500).json({ success: false, message: "DB error." });
            }
            if (rows.length === 0) {
                return res.status(404).json({ success: false, message: "Report not found." });
            }

            const r = rows[0];

            if (!isSelf(req, r.user_id)) {
                return res.status(403).json({ success: false, message: "Access denied." });
            }

            // Check file exists on disk
            const absPath = path.join(__dirname, "../../", r.file_path);
            if (!fs.existsSync(absPath)) {
                return res.json({ success: false, message: "File not found on server." });
            }

            // Read file and return as base64 dataurl (keeps frontend compatible)
            try {
                const buffer  = fs.readFileSync(absPath);
                const b64     = buffer.toString("base64");
                const dataurl = `data:${r.filetype};base64,${b64}`;
                res.json({
                    success:  true,
                    filename: r.file_name,
                    filetype: r.filetype,
                    dataurl
                });
            } catch (err2) {
                console.error("viewReport read error:", err2.message);
                return res.json({ success: false, message: "Failed to read file." });
            }
        }
    );
};

/* ── DELETE ─────────────────────────────────────────────────── */
const deleteReport = async (req, res) => {
    const { id } = req.params;

    try {
        const [rows] = await db.promise().query(
            "SELECT user_id, file_path FROM reports WHERE id = ?", [id]
        );

        if (rows.length === 0) return res.json({ success: false, message: "Report not found." });

        if (!isSelf(req, rows[0].user_id)) {
            return res.status(403).json({ success: false, message: "Access denied." });
        }

        // Delete file from disk first
        if (rows[0].file_path) {
            const absPath = path.join(__dirname, "../../", rows[0].file_path);
            try { fs.unlinkSync(absPath); } catch (_) { /* already gone — ignore */ }
        }

        db.query("DELETE FROM reports WHERE id = ?", [id], (err) => {
            if (err) {
                console.error("deleteReport DB error:", err.message);
                return res.json({ success: false, message: "Failed to delete record." });
            }
            res.json({ success: true, message: "Report deleted." });
        });

    } catch (err) {
        console.error("deleteReport error:", err.message);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

module.exports = { uploadReport, getReports, viewReport, deleteReport };