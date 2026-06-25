// ── CHANGED: P1.4 — no SQL error details sent to client ──
const db      = require("../config/db");
const bcrypt  = require("bcrypt");
const { isSelf } = require("../middleware/authMiddleware");

/* ── GET profile ──────────────────────────────────────────────── */
const getProfile = (req, res) => {
    const requestedId = parseInt(req.params.user_id);

    if (!isSelf(req, requestedId)) {
        return res.status(403).json({ success: false, message: "Access denied." });
    }

    const sql = `
        SELECT u.id, u.name, u.email, u.provider, u.created_at,
               p.phone, p.dob, p.gender, p.blood_group,
               p.height, p.weight, p.conditions,
               p.profile_image,
               (SELECT COUNT(*) FROM symptoms WHERE user_id = u.id) AS symptom_count
        FROM users u
        LEFT JOIN user_profiles p ON p.user_id = u.id
        WHERE u.id = ?
    `;

    db.query(sql, [requestedId], (err, rows) => {
        if (err) {
            // P1.4: log internally, never send err.sqlMessage to client
            console.error("Get profile error:", err.message);
            return res.json({ success: false, message: "Failed to load profile. Please try again." });
        }
        if (rows.length === 0) return res.json({ success: false, message: "User not found." });
        res.json({ success: true, profile: rows[0] });
    });
};

/* ── SAVE / UPDATE profile ────────────────────────────────────── */
const saveProfile = (req, res) => {
    const user_id = req.userId;

    const {
        name, phone, dob, gender, blood_group,
        conditions, profile_image
    } = req.body;

    const height = (req.body.height !== "" && req.body.height != null && !isNaN(req.body.height))
        ? parseFloat(req.body.height) : null;
    const weight = (req.body.weight !== "" && req.body.weight != null && !isNaN(req.body.weight))
        ? parseFloat(req.body.weight) : null;

    if (!name || !name.trim())              return res.json({ success: false, message: "Full name is required." });
    if (!phone || !phone.trim())            return res.json({ success: false, message: "Phone number is required." });
    if (!dob)                               return res.json({ success: false, message: "Date of birth is required." });
    if (!gender)                            return res.json({ success: false, message: "Gender is required." });
    if (!blood_group)                       return res.json({ success: false, message: "Blood group is required." });
    if (height === null || weight === null) return res.json({ success: false, message: "Height and weight are required." });

    // Validate reasonable ranges
    if (height < 50 || height > 300)  return res.json({ success: false, message: "Height must be between 50–300 cm." });
    if (weight < 10 || weight > 500)  return res.json({ success: false, message: "Weight must be between 10–500 kg." });

    db.query("UPDATE users SET name = ? WHERE id = ?", [name.trim(), user_id], (err) => {
        if (err) {
            console.error("Save profile name error:", err.message);
            return res.json({ success: false, message: "Failed to save profile. Please try again." });
        }

        const upsertSql = `
            INSERT INTO user_profiles
                (user_id, phone, dob, gender, blood_group, height, weight, conditions, profile_image)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                phone         = VALUES(phone),
                dob           = VALUES(dob),
                gender        = VALUES(gender),
                blood_group   = VALUES(blood_group),
                height        = VALUES(height),
                weight        = VALUES(weight),
                conditions    = VALUES(conditions),
                profile_image = COALESCE(VALUES(profile_image), profile_image),
                updated_at    = NOW()
        `;

        db.query(upsertSql, [
            user_id, phone.trim(), dob, gender, blood_group,
            height, weight,
            conditions ? conditions.trim() : "None",
            profile_image || null
        ], (err2) => {
            if (err2) {
                console.error("Save profile upsert error:", err2.message);
                return res.json({ success: false, message: "Failed to save profile. Please try again." });
            }
            res.json({ success: true, message: "Profile saved successfully." });
        });
    });
};

/* ── DELETE account ───────────────────────────────────────────── */
const deleteAccount = async (req, res) => {
    const requestedId = parseInt(req.params.user_id);

    if (!isSelf(req, requestedId)) {
        return res.status(403).json({ success: false, message: "Access denied." });
    }

    const { password } = req.body;

    try {
        const [rows] = await db.promise().query(
            "SELECT password, provider FROM users WHERE id = ?",
            [requestedId]
        );

        if (rows.length === 0) {
            return res.json({ success: false, message: "User not found." });
        }

        const user = rows[0];

        if (user.provider !== "google") {
            if (!password) {
                return res.json({
                    success: false,
                    message: "Please enter your password to confirm account deletion."
                });
            }

            const match = await bcrypt.compare(password, user.password);
            if (!match) {
                return res.json({
                    success: false,
                    message: "Incorrect password. Account not deleted."
                });
            }
        }

        db.query("DELETE FROM users WHERE id = ?", [requestedId], (err) => {
            if (err) {
                console.error("Delete account error:", err.message);
                return res.json({ success: false, message: "Failed to delete account. Please try again." });
            }
            res.json({ success: true, message: "Account deleted." });
        });

    } catch (err) {
        console.error("Delete account error:", err.message);
        return res.json({ success: false, message: "Server error. Please try again." });
    }
};

module.exports = { getProfile, saveProfile, deleteAccount };