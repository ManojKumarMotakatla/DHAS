const db = require("../config/db");

/* =========================
   SAVE SYMPTOMS
========================= */
const saveSymptoms = (req, res) => {
    const { user_id, symptoms, condition_name, severity } = req.body;

    if (!user_id) {
        return res.json({ success: false, message: "user_id is required." });
    }
    if (!symptoms || (Array.isArray(symptoms) && symptoms.length === 0)) {
        return res.json({ success: false, message: "symptoms are required." });
    }

    // symptoms may be an array or a string — always store as JSON string
    const symptomsStr = Array.isArray(symptoms)
        ? JSON.stringify(symptoms)
        : String(symptoms);

    const sql = `
        INSERT INTO symptoms (user_id, symptoms, condition_name, severity)
        VALUES (?, ?, ?, ?)
    `;

    db.query(sql, [user_id, symptomsStr, condition_name || null, severity || null], (err) => {
        if (err) {
            console.error("saveSymptoms DB error:", err);
            return res.json({ success: false, message: "Failed to save symptoms.", dbError: err.code, dbMessage: err.sqlMessage });
        }
        res.json({ success: true, message: "Symptoms saved." });
    });
};

/* =========================
   GET SYMPTOMS HISTORY
========================= */
const getSymptoms = (req, res) => {
    const { user_id } = req.params;

    if (!user_id) {
        return res.json({ success: false, message: "user_id required." });
    }

    const sql = "SELECT * FROM symptoms WHERE user_id = ? ORDER BY created_at DESC LIMIT 10";

    db.query(sql, [user_id], (err, result) => {
        if (err) {
            console.error("getSymptoms DB error:", err);
            return res.json({ success: false });
        }

        // Parse stored JSON symptoms back to arrays for the client
        const data = result.map(r => {
            let parsedSymptoms = r.symptoms;
            try { parsedSymptoms = JSON.parse(r.symptoms); } catch { /* leave as string */ }
            return { ...r, symptoms: parsedSymptoms };
        });

        res.json({ success: true, data });
    });
};

module.exports = { saveSymptoms, getSymptoms };