// ── CHANGED: P1.4 — no SQL error details sent to client ──
const db = require("../config/db");
const { isSelf } = require("../middleware/authMiddleware");

const saveSymptoms = (req, res) => {
    const user_id = req.userId;
    const { symptoms, condition_name, severity } = req.body;

    if (!symptoms || (Array.isArray(symptoms) && symptoms.length === 0)) {
        return res.json({ success: false, message: "Symptoms are required." });
    }

    const symptomsStr = Array.isArray(symptoms) ? JSON.stringify(symptoms) : String(symptoms);

    db.query(
        "INSERT INTO symptoms (user_id, symptoms, condition_name, severity) VALUES (?, ?, ?, ?)",
        [user_id, symptomsStr, condition_name || null, severity || null],
        (err) => {
            if (err) {
                console.error("saveSymptoms DB error:", err.message);
                return res.json({ success: false, message: "Failed to save symptoms. Please try again." });
            }
            res.json({ success: true, message: "Symptoms saved." });
        }
    );
};

const getSymptoms = (req, res) => {
    const requestedId = parseInt(req.params.user_id);

    if (!isSelf(req, requestedId)) {
        return res.status(403).json({ success: false, message: "Access denied." });
    }

    db.query(
        "SELECT * FROM symptoms WHERE user_id = ? ORDER BY created_at DESC LIMIT 20",
        [requestedId],
        (err, result) => {
            if (err) {
                console.error("getSymptoms DB error:", err.message);
                return res.json({ success: false, message: "Failed to load symptom history." });
            }

            const data = result.map(r => {
                let parsedSymptoms = r.symptoms;
                try { parsedSymptoms = JSON.parse(r.symptoms); } catch { }
                return { ...r, symptoms: parsedSymptoms };
            });

            res.json({ success: true, data });
        }
    );
};

module.exports = { saveSymptoms, getSymptoms };