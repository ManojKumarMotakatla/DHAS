const db = require("../config/db");

/* ── helper: detect actual column names on first use ── */
let _cols = null;   // { nameCol, uploadedCol }

function getReportCols(callback) {
    if (_cols) return callback(null, _cols);
    db.query("DESCRIBE reports", (err, rows) => {
        if (err) return callback(err);
        const names = rows.map(r => r.Field);
        _cols = {
            nameCol:     names.includes("file_name") ? "file_name" : "filename",
            uploadedCol: names.includes("uploaded_at") ? "uploaded_at" : "created_at"
        };
        console.log("reports table cols detected:", _cols);
        callback(null, _cols);
    });
}

const uploadReport = (req, res) => {
    const { user_id, filename, filesize, filetype, dataurl } = req.body;

    if (!user_id || !filename || !dataurl) {
        return res.json({
            success: false,
            message: !user_id  ? "User not logged in."
                   : !filename ? "Filename missing."
                   : "File data missing."
        });
    }
    if (!String(dataurl).startsWith("data:")) {
        return res.json({ success: false, message: "Invalid file data." });
    }

    getReportCols((err, cols) => {
        if (err) return res.json({ success: false, message: "DB error.", dbError: err.code });

        const sql = `INSERT INTO reports (user_id, ${cols.nameCol}, filesize, filetype, dataurl) VALUES (?, ?, ?, ?, ?)`;
        db.query(sql, [user_id, filename, filesize || "", filetype || "", dataurl], (err2) => {
            if (err2) {
                console.error("uploadReport DB error:", err2);
                return res.json({ success: false, message: "Failed to upload.", dbError: err2.code, dbMessage: err2.sqlMessage });
            }
            res.json({ success: true, message: "Report uploaded." });
        });
    });
};

const getReports = (req, res) => {
    const { user_id } = req.params;
    getReportCols((err, cols) => {
        if (err) return res.json({ success: false });
        const sql = `SELECT id, ${cols.nameCol}, filesize, filetype, ${cols.uploadedCol} FROM reports WHERE user_id = ? ORDER BY ${cols.uploadedCol} DESC`;
        db.query(sql, [user_id], (err2, result) => {
            if (err2) return res.json({ success: false });
            const data = result.map(r => ({
                ...r,
                filename:    r[cols.nameCol],
                uploaded_at: r[cols.uploadedCol]
            }));
            res.json({ success: true, data });
        });
    });
};

const viewReport = (req, res) => {
    const { id } = req.params;
    getReportCols((err, cols) => {
        if (err) return res.json({ success: false });
        const sql = `SELECT ${cols.nameCol}, filetype, dataurl FROM reports WHERE id = ?`;
        db.query(sql, [id], (err2, result) => {
            if (err2 || result.length === 0) return res.json({ success: false });
            res.json({
                success:  true,
                filename: result[0][cols.nameCol],
                filetype: result[0].filetype,
                dataurl:  result[0].dataurl
            });
        });
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