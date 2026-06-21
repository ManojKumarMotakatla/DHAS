// ============================================================
// DHAS — Backend/controllers/changePasswordController.js
// Handles authenticated password change for BOTH patients and doctors.
// Supports patient JWT (userId) and doctor JWT (doctorId + role:"doctor").
// JWT auth required (requireAuth or requireDoctorAuth middleware, but
// this controller now self-identifies the caller via the token shape).
// ============================================================

const db     = require("../config/db");
const bcrypt = require("bcrypt");
const jwt    = require("jsonwebtoken");

/**
 * POST /profile/change-password
 * Body: { current_password, new_password }
 * Auth: Bearer token required (patient OR doctor token accepted)
 */
const changePassword = async (req, res) => {
    // ── Identify caller: patient or doctor ────────────────
    // requireAuth sets req.userId (patient).
    // requireDoctorAuth sets req.doctorId (doctor).
    // This controller is mounted on a patient route, so we also
    // manually decode the token to handle doctor callers gracefully.
    let isDoctor = false;
    let actorId  = null;

    if (req.doctorId) {
        // Called via doctor middleware (if ever re-mounted that way)
        isDoctor = true;
        actorId  = req.doctorId;
    } else if (req.userId) {
        // Normal patient path
        isDoctor = false;
        actorId  = req.userId;
    } else {
        // Fallback: decode token ourselves to handle doctor calling
        // a patient-middleware-protected route
        const authHeader = req.headers["authorization"];
        if (authHeader && authHeader.startsWith("Bearer ")) {
            try {
                const decoded = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET);
                if (decoded.role === "doctor" && decoded.doctorId) {
                    isDoctor = true;
                    actorId  = decoded.doctorId;
                } else if (decoded.userId) {
                    isDoctor = false;
                    actorId  = decoded.userId;
                }
            } catch (_) {}
        }
    }

    if (!actorId) {
        return res.status(401).json({ success: false, message: "Authentication required." });
    }

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
        // ── Fetch the right table ─────────────────────────
        const table    = isDoctor ? "doctors" : "users";
        const [rows]   = await db.promise().query(
            `SELECT password, provider FROM ${table} WHERE id = ?`,
            [actorId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: "Account not found." });
        }

        const account = rows[0];

        // Google-only accounts have no password
        if (account.provider === "google" && !account.password) {
            return res.status(400).json({
                success: false,
                message: "Your account uses Google Sign-In. You cannot set a password here."
            });
        }

        if (!account.password) {
            return res.status(400).json({
                success: false,
                message: "No password set for this account."
            });
        }

        // ── Verify current password ──────────────────────
        const match = await bcrypt.compare(current_password, account.password);
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
            `UPDATE ${table} SET password = ? WHERE id = ?`,
            [newHash, actorId]
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