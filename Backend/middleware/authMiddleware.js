// ── authMiddleware.js ─────────────────────────────────────────
// CHANGED: Added requireAnyAuth — accepts both patient and doctor
// tokens. Used exclusively on the change-password route so that
// doctors can call POST /profile/change-password without being
// rejected by the patient-only requireAuth middleware.
// ──────────────────────────────────────────────────────────────

const jwt = require("jsonwebtoken");

/**
 * Patient-only middleware. Sets req.userId from the JWT.
 * Doctor tokens (which carry doctorId, not userId) will be rejected.
 */
const requireAuth = (req, res, next) => {
    const authHeader = req.headers["authorization"];

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({
            success: false,
            message: "Authentication required. Please log in."
        });
    }

    const token = authHeader.slice(7);

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.userId = decoded.userId;
        next();
    } catch (err) {
        const isExpired = err.name === "TokenExpiredError";
        return res.status(401).json({
            success: false,
            message: isExpired
                ? "Session expired. Please log in again."
                : "Invalid session. Please log in again."
        });
    }
};

/**
 * Accepts BOTH patient tokens (userId) and doctor tokens (doctorId + role:"doctor").
 * Sets req.userId for patients OR req.doctorId + req.role="doctor" for doctors.
 * Use only on routes that must serve both user types (e.g. change-password).
 */
const requireAnyAuth = (req, res, next) => {
    const authHeader = req.headers["authorization"];

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({
            success: false,
            message: "Authentication required. Please log in."
        });
    }

    const token = authHeader.slice(7);

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        if (decoded.role === "doctor" && decoded.doctorId) {
            req.role     = "doctor";
            req.doctorId = decoded.doctorId;
        } else if (decoded.userId) {
            req.role   = "patient";
            req.userId = decoded.userId;
        } else {
            return res.status(401).json({
                success: false,
                message: "Invalid session token."
            });
        }

        next();
    } catch (err) {
        const isExpired = err.name === "TokenExpiredError";
        return res.status(401).json({
            success: false,
            message: isExpired
                ? "Session expired. Please log in again."
                : "Invalid session. Please log in again."
        });
    }
};

/**
 * Checks that the authenticated patient is accessing their own data.
 * Call after requireAuth.
 */
const isSelf = (req, targetUserId) => {
    return parseInt(req.userId) === parseInt(targetUserId);
};

module.exports = { requireAuth, requireAnyAuth, isSelf };