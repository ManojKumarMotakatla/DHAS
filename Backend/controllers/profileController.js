const db = require("../config/db");

/* ─────────────────────────────────────────────────────────────────────
   IMPORTANT — run this in MySQL before starting the server if upgrading:

   ALTER TABLE user_profiles
     ADD COLUMN IF NOT EXISTS profile_image MEDIUMTEXT NULL DEFAULT NULL;

   Or just drop & recreate from schema.sql if it's a dev database.
───────────────────────────────────────────────────────────────────── */

/* ── GET profile ──────────────────────────────────────────────────── */
const getProfile = (req, res) => {
    const { user_id } = req.params;

    if (!user_id || isNaN(user_id)) {
        return res.json({ success: false, message: "Invalid user ID." });
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

    db.query(sql, [user_id], (err, rows) => {
        if (err) {
            console.error("Get profile SQL error:", err.sqlMessage || err.message, err);
            return res.json({
                success: false,
                message: "Database error: " + (err.sqlMessage || err.message)
            });
        }
        if (rows.length === 0) {
            return res.json({ success: false, message: "User not found." });
        }
        res.json({ success: true, profile: rows[0] });
    });
};

/* ── SAVE / UPDATE profile ────────────────────────────────────────── */
const saveProfile = (req, res) => {
    const {
        user_id, name, phone, dob, gender,
        blood_group, conditions,
        profile_image   // base64 data-URL (optional, null = keep existing)
    } = req.body;

    // Parse numerics safely
    const height = (req.body.height !== "" && req.body.height != null && !isNaN(req.body.height))
        ? parseFloat(req.body.height) : null;
    const weight = (req.body.weight !== "" && req.body.weight != null && !isNaN(req.body.weight))
        ? parseFloat(req.body.weight) : null;

    // Required field validation
    if (!user_id)                           return res.json({ success: false, message: "User ID required." });
    if (!name || !name.trim())              return res.json({ success: false, message: "Full name is required." });
    if (!phone || !phone.trim())            return res.json({ success: false, message: "Phone number is required." });
    if (!dob)                               return res.json({ success: false, message: "Date of birth is required." });
    if (!gender)                            return res.json({ success: false, message: "Gender is required." });
    if (!blood_group)                       return res.json({ success: false, message: "Blood group is required." });
    if (height === null || weight === null) return res.json({ success: false, message: "Height and weight are required." });

    // Step 1: Update name in users table
    db.query(
        "UPDATE users SET name = ? WHERE id = ?",
        [name.trim(), user_id],
        (err) => {
            if (err) {
                console.error("Update name error:", err.sqlMessage || err.message);
                return res.json({ success: false, message: "Failed to update name: " + (err.sqlMessage || err.message) });
            }

            // Step 2: Upsert profile
            // COALESCE keeps existing profile_image if client sends null
            const upsertSql = `
                INSERT INTO user_profiles
                    (user_id, phone, dob, gender, blood_group, height, weight,
                     conditions, profile_image)
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
                user_id,
                phone.trim(),
                dob,
                gender,
                blood_group,
                height,
                weight,
                conditions ? conditions.trim() : "None",
                profile_image || null   // null → COALESCE keeps existing
            ], (err2) => {
                if (err2) {
                    console.error("Upsert profile error:", err2.sqlMessage || err2.message);
                    return res.json({
                        success: false,
                        message: "Failed to save profile: " + (err2.sqlMessage || err2.message)
                    });
                }
                res.json({ success: true, message: "Profile saved successfully." });
            });
        }
    );
};

/* ── DELETE account ───────────────────────────────────────────────── */
const deleteAccount = (req, res) => {
    const { user_id } = req.params;

    if (!user_id || isNaN(user_id)) {
        return res.json({ success: false, message: "Invalid user ID." });
    }

    db.query("DELETE FROM users WHERE id = ?", [user_id], (err) => {
        if (err) {
            console.error("Delete account error:", err.sqlMessage || err.message);
            return res.json({ success: false, message: "Failed to delete account." });
        }
        res.json({ success: true, message: "Account deleted." });
    });
};

module.exports = { getProfile, saveProfile, deleteAccount };