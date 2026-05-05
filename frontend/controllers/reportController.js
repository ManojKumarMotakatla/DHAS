const db = require("../config/db");

/* =========================
   UPLOAD REPORT
========================= */
const uploadReport = (req, res) => {
    const { user_id, filename, filesize } = req.body;

    if (!user_id || !filename) {
        return res.json({ success: false, message: "All fields required." });
    }

    const sql = "INSERT INTO reports (user_id, filename, filesize) VALUES (?, ?, ?)";

    db.query(sql, [user_id, filename, filesize], (err) => {
        if (err) return res.json({ success: false, message: "Failed to upload report." });
        res.json({ success: true, message: "Report uploaded." });
    });
};

/* =========================
   GET REPORTS
========================= */
const getReports = (req, res) => {
    const { user_id } = req.params;

    db.query("SELECT * FROM reports WHERE user_id = ? ORDER BY uploaded_at DESC", [user_id], (err, result) => {
        if (err) return res.json({ success: false });
        res.json({ success: true, data: result });
    });
};

/* =========================
   DELETE REPORT
========================= */
const deleteReport = (req, res) => {
    const { id } = req.params;

    db.query("DELETE FROM reports WHERE id = ?", [id], (err) => {
        if (err) return res.json({ success: false });
        res.json({ success: true, message: "Report deleted." });
    });
};

module.exports = { uploadReport, getReports, deleteReport };