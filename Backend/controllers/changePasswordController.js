// ============================================================
// DHAS — Backend/controllers/changePasswordController.js
// Handles authenticated password change.
// User must supply current password + new password.
// JWT auth required (requireAuth middleware).
// ============================================================

const db     = require("../config/db");
const bcrypt = require("bcrypt");

/**
 * POST /profile/change-password
 * Body: { current_password, new_password }
 * Auth: Bearer token required
 */
const changePassword = async (req, res) => {
    const user_id       = req.userId;
    const { current_password, new_password } = req.body;

    // ── Input validation ──────────────────────────────────
    if (!current_password || !new_password) {
        return res.status(400).json({
            success: false,
            message: "Both current password and new password are required."
        });
    }

    if (new_password.length < 6) {
        return res.status(400).json({
            success: false,
            message: "New password must be at least 6 characters."
        });
    }

    const hasUpper = /[A-Z]/.test(new_password);
    const hasLower = /[a-z]/.test(new_password);
    const hasNum   = /[0-9]/.test(new_password);
    const hasSym   = /[^A-Za-z0-9]/.test(new_password);

    if (!hasUpper || !hasLower || !hasNum || !hasSym) {
        return res.status(400).json({
            success: false,
            message: "New password must include uppercase, lowercase, number, and symbol."
        });
    }

    if (current_password === new_password) {
        return res.status(400).json({
            success: false,
            message: "New password must be different from your current password."
        });
    }

    try {
        // ── Fetch user's current hashed password ─────────
        const [rows] = await db.promise().query(
            "SELECT password, provider FROM users WHERE id = ?",
            [user_id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: "User not found." });
        }

        const user = rows[0];

        // Google-only accounts have no password
        if (user.provider === "google" && !user.password) {
            return res.status(400).json({
                success: false,
                message: "Your account uses Google Sign-In. You cannot set a password here."
            });
        }

        if (!user.password) {
            return res.status(400).json({
                success: false,
                message: "No password set for this account."
            });
        }

        // ── Verify current password ──────────────────────
        const match = await bcrypt.compare(current_password, user.password);
        if (!match) {
            return res.status(401).json({
                success: false,
                message: "Current password is incorrect."
            });
        }

        // ── Hash new password and update ─────────────────
        const salt    = await bcrypt.genSalt(10);
        const newHash = await bcrypt.hash(new_password, salt);

        await db.promise().query(
            "UPDATE users SET password = ? WHERE id = ?",
            [newHash, user_id]
        );

        res.json({
            success: true,
            message: "Password changed successfully. Please log in again."
        });

    } catch (err) {
        console.error("changePassword error:", err.message);
        res.status(500).json({
            success: false,
            message: "Failed to change password. Please try again."
        });
    }
};

module.exports = { changePassword };