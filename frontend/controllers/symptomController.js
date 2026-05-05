const db = require("../config/db");

/* =========================
   SAVE SYMPTOMS
========================= */
const saveSymptoms = (req, res) => {
    const { user_id, symptoms, condition_name, severity } = req.body;

    const sql = `
        INSERT INTO symptoms (user_id, symptoms, condition_name, severity)
        VALUES (?, ?, ?, ?)
    `;

    db.query(sql, [user_id, JSON.stringify(symptoms), condition_name, severity], (err) => {
        if (err) return res.json({ success: false, message: "Failed to save symptoms." });
        res.json({ success: true, message: "Symptoms saved." });
    });
};

/* =========================
   GET SYMPTOMS HISTORY
========================= */
const getSymptoms = (req, res) => {
    const { user_id } = req.params;

    const sql = "SELECT * FROM symptoms WHERE user_id = ? ORDER BY created_at DESC LIMIT 10";

    db.query(sql, [user_id], (err, result) => {
        if (err) return res.json({ success: false });
        res.json({ success: true, data: result });
    });
};

module.exports = { saveSymptoms, getSymptoms };