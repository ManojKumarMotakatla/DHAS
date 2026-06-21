// ============================================================
// DHAS — Backend/controllers/changePasswordController.js
// Handles authenticated password change for BOTH patients and doctors.
// Supports patient JWT (userId) and doctor JWT (doctorId + role:"doctor").
// JWT auth required (requireAuth or requireDoctorAuth middleware, but
// this controller now self-identifies the caller via the token shape).
//
// FIX (this version):
//   The previous version checked `account.provider === "google"` to
//   decide whether an account is Google-only. That works for the
//   `users` table (which has a `provider` column) but the `doctors`
//   table has NO `provider` column at all — only `google_id`. So for
//   every doctor this check silently evaluated to false/undefined,
//   meaning Google-only doctors fell through to the
//   "No password set for this account." branch instead of the
//   correct, friendlier Google-specific message — and worse, any
//   doctor who DID set a password later but originally signed up via
//   Google could hit edge cases here. We now detect Google-only
//   accounts uniformly for BOTH tables using the same rule the
//   frontend already uses: `google_id is set AND password is NULL`.
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
    // requireAnyAuth (used on this route) sets req.role + req.doctorId/req.userId.
    let isDoctor = false;
    let actorId  = null;

    if (req.role === "doctor" && req.doctorId) {
        isDoctor = true;
        actorId  = req.doctorId;
    } else if (req.doctorId) {
        // Called via doctor-only middleware (if ever re-mounted that way)
        isDoctor = true;
        actorId  = req.doctorId;
    } else if (req.userId) {
        // Normal patient path
        isDoctor = false;
        actorId  = req.userId;
    } else {
        // Fallback: decode token ourselves to handle any middleware gap
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
        // FIX: select google_id explicitly. `provider` only exists on
        // `users`, not `doctors` — selecting a column that doesn't
        // exist on `doctors` would throw a SQL error, so we no longer
        // select `provider` at all and instead rely on `google_id`,
        // which exists on BOTH tables.
        const table  = isDoctor ? "doctors" : "users";
        const [rows] = await db.promise().query(
            `SELECT password, google_id FROM ${table} WHERE id = ?`,
            [actorId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: "Account not found." });
        }

        const account = rows[0];

        // FIX: Google-only account = has a google_id AND no password set.
        // This is the same rule used on the frontend (doctor_dashboard.html
        // already computes `isGoogleOnly = !!d.google_id && !d.password`),
        // now applied consistently on the backend for both patients and
        // doctors, since `doctors` has no `provider` column to check.
        const isGoogleOnly = !!account.google_id && !account.password;

        if (isGoogleOnly) {
            return res.status(400).json({
                success: false,
                message: "Your account uses Google Sign-In. Password change is not available for Google accounts."
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
        // Log the REAL error server-side so future debugging doesn't
        // rely on the generic frontend fallback text again.
        console.error("changePassword error:", err.message);
        res.status(500).json({
            success: false,
            message: "Failed to change password. Please try again."
        });
    }
};

module.exports = { changePassword };