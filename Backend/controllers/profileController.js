// ── CHANGED: user_id now comes from req.userId (JWT), not params/body ──
// This means a user cannot access or modify another user's profile by
// changing the ID in the URL — the server ignores the URL param for
// auth purposes and uses the token-verified ID instead.
const db      = require("../config/db");
const bcrypt  = require("bcrypt");
const { isSelf } = require("../middleware/authMiddleware");

/* ── GET profile ──────────────────────────────────────────────── */
const getProfile = (req, res) => {
    const requestedId = parseInt(req.params.user_id);

    // CHANGED: verify that the token owner is requesting their own profile
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
            console.error("Get profile SQL error:", err.sqlMessage || err.message);
            return res.json({ success: false, message: "Database error: " + (err.sqlMessage || err.message) });
        }
        if (rows.length === 0) return res.json({ success: false, message: "User not found." });
        res.json({ success: true, profile: rows[0] });
    });
};

/* ── SAVE / UPDATE profile ────────────────────────────────────── */
const saveProfile = (req, res) => {
    // CHANGED: use token-verified ID, ignore any user_id in the body
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

    db.query("UPDATE users SET name = ? WHERE id = ?", [name.trim(), user_id], (err) => {
        if (err) return res.json({ success: false, message: "Failed to update name." });

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
            if (err2) return res.json({ success: false, message: "Failed to save profile: " + (err2.sqlMessage || err2.message) });
            res.json({ success: true, message: "Profile saved successfully." });
        });
    });
};

/* ── DELETE account ───────────────────────────────────────────────
   CHANGED: requires the user's current password as extra confirmation.
   This directly answers your question: "if a user wants to delete,
   they must provide the password."
   
   Google-only accounts are exempt (they have no password).
────────────────────────────────────────────────────────────────── */
const deleteAccount = async (req, res) => {
    const requestedId = parseInt(req.params.user_id);

    // Only the account owner can delete their own account
    if (!isSelf(req, requestedId)) {
        return res.status(403).json({ success: false, message: "Access denied." });
    }

    // CHANGED: require password confirmation before deleting
    const { password } = req.body;

    try {
        // Fetch the stored password hash for this user
        const [rows] = await db.promise().query(
            "SELECT password, provider FROM users WHERE id = ?",
            [requestedId]
        );

        if (rows.length === 0) {
            return res.json({ success: false, message: "User not found." });
        }

        const user = rows[0];

        // Google-only accounts have no password — skip the check
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
            if (err) return res.json({ success: false, message: "Failed to delete account." });
            res.json({ success: true, message: "Account deleted." });
        });

    } catch (err) {
        console.error("Delete account error:", err);
        return res.json({ success: false, message: "Server error." });
    }
};

module.exports = { getProfile, saveProfile, deleteAccount };