// ── symptomController.js (FIXED) ─────────────────────────────
// FIXED: getSymptoms now correctly handles user_id from JWT (req.userId)
//        and the isSelf check properly compares against the param.
// FIXED: Added proper null/undefined severity handling.
// FIXED: Ensured condition_name is stored properly.
// P1.4: No SQL error details sent to client.
// ─────────────────────────────────────────────────────────────
const db = require("../config/db");
const { isSelf } = require("../middleware/authMiddleware");

const saveSymptoms = (req, res) => {
    const user_id = req.userId;
    const { symptoms, condition_name, severity } = req.body;

    if (!symptoms || (Array.isArray(symptoms) && symptoms.length === 0)) {
        return res.json({ success: false, message: "Symptoms are required." });
    }

    const symptomsStr = Array.isArray(symptoms) ? JSON.stringify(symptoms) : String(symptoms);

    // FIX: Ensure severity is always one of the valid values
    // symptom.js passes condition.severityLabel which is 'High', 'Medium', or 'Low'
    // Normalise to ensure consistent storage
    const validSeverities = ["High", "Medium", "Low"];
    let normSeverity = severity;
    if (!normSeverity || !validSeverities.includes(normSeverity)) {
        // Map variants to standard values
        const s = String(normSeverity || "").toLowerCase().trim();
        if (s === "high" || s === "severe")            normSeverity = "High";
        else if (s === "medium" || s === "moderate")   normSeverity = "Medium";
        else if (s === "low" || s === "mild")          normSeverity = "Low";
        else                                           normSeverity = "Low"; // default
    }

    db.query(
        "INSERT INTO symptoms (user_id, symptoms, condition_name, severity) VALUES (?, ?, ?, ?)",
        [user_id, symptomsStr, condition_name || null, normSeverity],
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
    // Support both /history/:user_id and /:user_id param names
    const requestedId = parseInt(req.params.user_id || req.params.id);

    if (isNaN(requestedId)) {
        return res.status(400).json({ success: false, message: "Invalid user ID." });
    }

    if (!isSelf(req, requestedId)) {
        return res.status(403).json({ success: false, message: "Access denied." });
    }

    db.query(
        "SELECT * FROM symptoms WHERE user_id = ? ORDER BY created_at DESC LIMIT 50",
        [requestedId],
        (err, result) => {
            if (err) {
                console.error("getSymptoms DB error:", err.message);
                return res.json({ success: false, message: "Failed to load symptom history." });
            }

            const data = result.map(r => {
                let parsedSymptoms = r.symptoms;
                try { parsedSymptoms = JSON.parse(r.symptoms); } catch { }

                // FIX: Ensure severity is always normalised when reading back
                // This fixes old data that might have 'mild', 'moderate', 'severe' stored
                let sev = r.severity;
                if (sev) {
                    const s = String(sev).toLowerCase().trim();
                    if (s === "high" || s === "severe")           sev = "High";
                    else if (s === "medium" || s === "moderate")  sev = "Medium";
                    else if (s === "low" || s === "mild")         sev = "Low";
                    // Keep as-is if already correct
                } else {
                    sev = "Low"; // Default for null/undefined
                }

                return { ...r, symptoms: parsedSymptoms, severity: sev };
            });

            res.json({ success: true, data });
        }
    );
};

module.exports = { saveSymptoms, getSymptoms };