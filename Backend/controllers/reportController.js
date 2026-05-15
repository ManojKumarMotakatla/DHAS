const db = require("../config/db");

const uploadReport = (req, res) => {
    const { user_id, filename, filesize, filetype, dataurl } = req.body;
    if (!user_id || !filename || !dataurl)
        return res.json({ success: false, message: "All fields required." });

    const sql = "INSERT INTO reports (user_id, file_name, filesize, filetype, dataurl) VALUES (?, ?, ?, ?, ?)";
    db.query(sql, [user_id, filename, filesize, filetype, dataurl], (err) => {
        if (err) { console.error(err); return res.json({ success: false, message: "Failed to upload." }); }
        res.json({ success: true, message: "Report uploaded." });
    });
};

const getReports = (req, res) => {
    const { user_id } = req.params;
    db.query("SELECT id, filename, filesize, filetype, uploaded_at FROM reports WHERE user_id = ? ORDER BY uploaded_at DESC", [user_id], (err, result) => {
        if (err) return res.json({ success: false });
        res.json({ success: true, data: result });
    });
};

// New — fetch single report with dataurl for viewing
const viewReport = (req, res) => {
    const { id } = req.params;
    db.query("SELECT filename, filetype, dataurl FROM reports WHERE id = ?", [id], (err, result) => {
        if (err || result.length === 0) return res.json({ success: false });
        res.json({ success: true, ...result[0] });
    });
};

const deleteReport = (req, res) => {
    const { id } = req.params;
    db.query("DELETE FROM reports WHERE id = ?", [id], (err) => {
        if (err) return res.json({ success: false });
        res.json({ success: true, message: "Report deleted." });
    });
};

module.exports = { uploadReport, getReports, viewReport, deleteReport };